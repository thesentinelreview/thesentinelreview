"""
Briefing generator — produces the BLUF-format theater briefing from structured
event data.

Uses Opus (highest quality) with a cached system prompt. Output is plain
markdown with four fixed section headings (## BLUF / ## WHAT CHANGED /
## WHY IT MATTERS / ## OUTLOOK (24–72H)) stored as-is in draft_text — the
dashboard renderer detects the format; the schema is unchanged. Returns
structured JSON output validated against BriefingOutput. Never auto-publishes.
"""
from __future__ import annotations

import json
import uuid
from datetime import timezone

import anthropic
import structlog

from sentinel.config import settings
from sentinel.models import BriefingInput, BriefingOutput

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

_SYSTEM = """You are a senior conflict analyst writing the theater intelligence briefing
for Sentinel Review, a public OSINT conflict intelligence tool.

Your audience: OSINT analysts, conflict journalists, and security researchers. They are
technically literate and will notice vague or speculative language.

Output format (BLUF doctrine): the briefing is markdown with exactly these four section
headings, in this order, and no other headings. Each heading sits on its own line,
followed by a blank line, then its body.

## BLUF
1–2 sentences. The single most important takeaway for the period. No throat-clearing.

## WHAT CHANGED
Concrete deltas vs. the supplied 7-day baseline and notable shifts. Tie every claim to
the supplied events.

## WHY IT MATTERS
Operational/strategic significance, grounded in the period's events only.

## OUTLOOK (24–72H)
Indicators to watch, framed as monitoring priorities. Never predictions.
Use uncertainty language ("watch for", "would indicate").
No probability claims, no forecasted outcomes.
State what to monitor and what an observed change would indicate — never what will happen.

Style and hard rules:
- Plain, precise prose. No marketing language. No adjectives not grounded in the data.
  Maximum 300 words total across all sections.
- Explicitly distinguish verified from unconfirmed ("two clusters are corroborated...",
  "single-sourced and unverified..."); treat the supplied confidence labels as given.
- After the OUTLOOK body, add exactly this line as its own paragraph: "⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use."
- Never speculate beyond the input event list.
- Never reference event IDs in the prose — use location names instead.

You MUST call the record_briefing tool exactly once."""

_TOOL: anthropic.types.ToolParam = {
    "name": "record_briefing",
    "description": "Record the finished briefing with all required metadata.",
    "input_schema": {
        "type": "object",
        "properties": {
            "draft_text": {
                "type": "string",
                "description": (
                    "The briefing as markdown with exactly four sections in order: "
                    "## BLUF, ## WHAT CHANGED, ## WHY IT MATTERS, ## OUTLOOK (24–72H), "
                    "ending with the AI-generated disclaimer paragraph."
                ),
            },
            "referenced_event_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "UUIDs of every event from the input list that is mentioned in the briefing. Must be a subset of the provided event IDs.",
            },
            "confidence_summary": {
                "type": "string",
                "description": "One-liner e.g. '12 verified, 8 partial, 5 unconfirmed'",
            },
        },
        "required": ["draft_text", "referenced_event_ids", "confidence_summary"],
    },
}


def generate_briefing_draft(
    briefing_input: BriefingInput,
) -> tuple[BriefingOutput, dict]:
    """
    Generate a briefing draft. Returns (BriefingOutput, llm_meta).
    """
    user_content = _build_user_message(briefing_input)

    response = _client.messages.create(
        model=settings.anthropic_model_briefing,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": _SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[_TOOL],
        tool_choice={"type": "tool", "name": "record_briefing"},
        messages=[{"role": "user", "content": user_content}],
    )

    tool_block = next(
        (b for b in response.content if b.type == "tool_use"),
        None,
    )
    if tool_block is None:
        raise RuntimeError("LLM did not call record_briefing tool")

    raw: dict = tool_block.input  # type: ignore[union-attr]

    # Validate referenced_event_ids are a subset of provided IDs
    allowed_ids = {str(e["id"]) for e in briefing_input.events}
    ref_ids: list[uuid.UUID] = []
    for raw_id in raw.get("referenced_event_ids", []):
        if str(raw_id) in allowed_ids:
            ref_ids.append(uuid.UUID(str(raw_id)))
        else:
            log.warning("briefing_hallucinated_event_id", raw_id=raw_id)

    output = BriefingOutput(
        draft_text=raw["draft_text"],
        referenced_event_ids=ref_ids,
        confidence_summary=raw["confidence_summary"],
    )

    llm_meta = {
        "model": response.model,
        "prompt": user_content,
        "response": json.dumps(raw),
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
    }

    return output, llm_meta


def _build_user_message(inp: BriefingInput) -> str:
    period_start = inp.period_start.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    period_end = inp.period_end.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    conf_counts: dict[str, int] = {"verified": 0, "partial": 0, "unconfirmed": 0}
    for e in inp.events:
        conf_counts[e.get("confidence", "unconfirmed")] += 1

    events_text = "\n".join(
        f"- [{e['id']}] {e['event_type'].upper()} | {e['location_name']}, {e['oblast']} "
        f"| {e['confidence'].upper()} | {e.get('source_count', '?')} source(s) "
        f"| {e['occurred_at']} | {e['description']}"
        for e in inp.events
    )

    shifts_text = "\n".join(f"  - {s}" for s in inp.notable_shifts) or "  (no notable shifts)"

    baseline_text = "\n".join(
        f"  - {oblast}: {avg:.1f} events/day"
        for oblast, avg in sorted(inp.baseline_7d.items(), key=lambda x: -x[1])
    ) or "  (no baseline data)"

    return f"""Theater: {inp.theater.upper()}
Period: {period_start} → {period_end}

Event summary:
  Verified: {conf_counts['verified']}
  Partial: {conf_counts['partial']}
  Unconfirmed: {conf_counts['unconfirmed']} (exclude from briefing — mention only as watch item if relevant)

7-day baseline (events/day by oblast):
{baseline_text}

Notable shifts vs baseline:
{shifts_text}

Event list (use event IDs when calling record_briefing.referenced_event_ids):
{events_text}

Write the briefing now. Only reference events from the list above."""
