"""
Theater router — decides which conflict theater a post belongs to from its
CONTENT, so extraction is judged under the right theater's rules.

Replaces the old ``source.theaters[0]`` assumption at extraction time: a
multi-theater source (ISW covers Ukraine AND Iran) or a single-theater source
carrying cross-theater content (an @TheStudyofWar post about Iran) is now routed
by what the post is ABOUT, with the source's primary theater used only as a
tie-breaking prior.

Cheap by design: one Haiku tool-call per post (not Sonnet). Biased toward
inclusion — returns None (the caller short-circuits the expensive extract) ONLY
when the post is confidently not about armed conflict in or related to any
covered theater. On ambiguity or a router glitch it fails OPEN to the prior
theater and lets the tuned extraction prompt make the final has_event call, so
real in-theater signal is never dropped by the router.
"""
from __future__ import annotations

import anthropic
import structlog

from sentinel.config import settings

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

THEATERS: tuple[str, ...] = ("ukraine", "iran", "sudan", "myanmar")

_TOOL: anthropic.types.ToolParam = {
    "name": "set_theater",
    "description": "Record which conflict theater the post belongs to.",
    "input_schema": {
        "type": "object",
        "properties": {
            "theater": {
                "type": "string",
                "enum": [*THEATERS, "none"],
                "description": (
                    "The conflict theater the post is about. Use 'none' ONLY when "
                    "the post is confidently not about armed conflict in or related "
                    "to any of these theaters."
                ),
            },
        },
        "required": ["theater"],
    },
}

_SYSTEM = """You are a fast router for an OSINT conflict-monitoring pipeline. Decide which conflict theater a single post belongs to, so a downstream analyst prompt can judge it under the right rules. You are NOT deciding whether the post contains an event — only its theater.

The four theaters and what counts as related:
- ukraine: the Russia–Ukraine war (including strikes inside Russia and Black Sea naval action).
- iran: Iran-related military or nuclear activity — IRGC ground/naval operations, the Strait of Hormuz, Israel–Iran strikes and counter-strikes, US/CENTCOM strikes on Iran, and Iran-directed proxy activity in Lebanon, Syria, Iraq, Yemen, and Gaza.
- sudan: the SAF–RSF civil war (Khartoum, Darfur, Kordofan, etc.).
- myanmar: the post-coup civil war — Tatmadaw/SAC junta vs the PDF and ethnic armed organisations (Arakan Army, KNLA, TNLA, MNDAA, KIA).

Routing rules:
- Route by the CONTENT of the post, not its source. A source that usually covers one theater can post about another.
- A "primary theater hint" is provided (the source's usual coverage). Use it ONLY to break genuine ties — never to override clear content. If the post is clearly about Iran, answer iran even when the hint is ukraine.
- Bias toward inclusion. If the post plausibly relates to any theater, route it there and let the downstream prompt decide. Answer 'none' ONLY when you are confident the post is not about armed conflict in or related to any of the four theaters (e.g. US domestic politics, sports, unrelated business or technology news).
- Diplomacy, sanctions, and commentary ABOUT a theater still belong to that theater — route them there (the downstream prompt handles scope). They are NOT 'none'.

Call set_theater exactly once."""


def classify_theater(text: str, *, source: dict) -> tuple[str | None, dict]:
    """Route a post to a theater from its content.

    Returns (theater, llm_meta). ``theater`` is one of THEATERS, or None when the
    post is confidently off all four theaters (the caller should skip without
    extracting). ``llm_meta`` is the audit-log payload for log_llm_call.
    """
    prior = (source.get("theaters") or ["ukraine"])[0]
    fallback = prior if prior in THEATERS else "ukraine"
    user_message = (
        f"Primary theater hint (source's usual coverage): {prior}\n\n"
        f"Post text:\n{text[:2000]}"
    )

    response = _client.messages.create(
        model=settings.anthropic_model_classify,
        max_tokens=128,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        tools=[_TOOL],
        tool_choice={"type": "tool", "name": "set_theater"},
        messages=[{"role": "user", "content": user_message}],
    )

    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    choice = (tool_block.input or {}).get("theater") if tool_block is not None else None

    theater: str | None
    if choice in THEATERS:
        theater = choice
    elif choice == "none":
        theater = None
    else:
        # Missing/unexpected value (incl. no tool call): fail OPEN to the prior so
        # a router glitch never silently drops a post.
        theater = fallback
        log.warning("theater_router_unexpected_choice", choice=choice, fallback=fallback)

    llm_meta = {
        "model": response.model,
        "prompt": user_message,
        "response": str(choice),
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
    }
    log.debug("theater_routed", source=source.get("handle"), prior=prior, theater=theater)
    return theater, llm_meta
