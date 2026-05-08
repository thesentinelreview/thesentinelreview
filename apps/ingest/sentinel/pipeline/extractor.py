"""
Entity extraction — takes a raw post text and returns a structured ExtractedEvent.

Uses Claude tool_use for guaranteed structured output. The system prompt is
cached via prompt caching to reduce token costs on bulk extraction runs.
"""
from __future__ import annotations

import json

import anthropic
import structlog

from sentinel.config import settings
from sentinel.models import ExtractedEvent, GeolocationSignal

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# ---------------------------------------------------------------------------
# Extraction tool schema (forces structured output)
# ---------------------------------------------------------------------------

_TOOL: anthropic.types.ToolParam = {
    "name": "record_event",
    "description": (
        "Record a conflict event extracted from an OSINT post. "
        "Call this exactly once per post — even if no event is found."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "has_event": {
                "type": "boolean",
                "description": "True if the post describes a real, discrete conflict event.",
            },
            "skip_reason": {
                "type": "string",
                "description": "Why the post was skipped. Only set when has_event is false.",
            },
            "event_type": {
                "type": "string",
                "enum": ["strike", "clash", "movement"],
                "description": "strike = missile/drone/artillery impact; clash = infantry/armour contact; movement = troop/equipment repositioning.",
            },
            "occurred_at": {
                "type": "string",
                "description": "ISO 8601 UTC datetime of the event. Use post timestamp if unknown.",
            },
            "location_name": {
                "type": "string",
                "description": "City, settlement, or axis name. Use the most specific name mentioned.",
            },
            "oblast": {
                "type": "string",
                "description": "Ukrainian oblast name (e.g. Donetsk, Kharkiv, Zaporizhzhia).",
            },
            "lat": {
                "type": "number",
                "description": "Latitude in decimal degrees (WGS84). Best estimate from location_name.",
            },
            "lng": {
                "type": "number",
                "description": "Longitude in decimal degrees (WGS84). Best estimate from location_name.",
            },
            "actor": {
                "type": "string",
                "description": "Attacking or moving force if identified (e.g. 'Russian forces', 'Ukrainian 10th Corps'). Null if unknown.",
            },
            "description": {
                "type": "string",
                "description": "One to two sentences describing the event. No speculation. Only what the post states.",
            },
            "geolocation_signals": {
                "type": "object",
                "description": "Signals present in the post that help establish location and confidence.",
                "properties": {
                    "geolocated_footage": {"type": "boolean"},
                    "official_acknowledgment": {"type": "boolean"},
                    "matching_press": {"type": "boolean"},
                    "coordinates_given": {"type": "boolean"},
                    "landmarks_visible": {"type": "boolean"},
                },
                "required": [
                    "geolocated_footage", "official_acknowledgment",
                    "matching_press", "coordinates_given", "landmarks_visible",
                ],
            },
            "is_high_impact": {
                "type": "boolean",
                "description": "True if the event involves mass casualties (10+), use of weapons of mass destruction, or a major escalation (e.g. cross-border strike on a new country).",
            },
        },
        "required": ["has_event"],
    },
}

# ---------------------------------------------------------------------------
# Cached system prompt
# ---------------------------------------------------------------------------

_SYSTEM = """You are an OSINT analyst assistant for Sentinel Review, a conflict intelligence tool.

Your task: analyse a single social media post about the conflict in Ukraine and extract one structured conflict event if one is present.

Rules:
- Extract only discrete, specific events — not general commentary, analysis, or opinion.
- Do not speculate or infer beyond what the post explicitly states.
- If the post is vague, a duplicate signal with no new information, commentary, or unrelated to a military event, set has_event=false and explain in skip_reason.
- For coordinates: use your knowledge of Ukrainian geography to provide the best estimate for the location_name. If you cannot place the location, set has_event=false.
- Descriptions must be factual and neutral. Never add adjectives like "devastating" or "brutal" not present in the source.
- is_high_impact must be true for: mass-casualty events (10+ killed/wounded claimed), strikes on nuclear facilities, use of chemical/biological/radiological weapons, or attacks on a country not previously targeted in this conflict.

You MUST call the record_event tool exactly once."""

# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_event(
    text: str,
    *,
    source: dict,
) -> tuple[ExtractedEvent, dict]:
    """
    Extract a structured event from a raw post.

    Returns:
        (ExtractedEvent, llm_meta)  where llm_meta carries model/token/prompt/response
        for the audit log.
    """
    user_message = (
        f"Source: {source['display_name']} ({source['platform']}, trust tier {source['trust_tier']})\n\n"
        f"Post text:\n{text[:4000]}"  # hard cap to avoid prompt blowout
    )

    response = _client.messages.create(
        model=settings.anthropic_model_extract,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": _SYSTEM,
                "cache_control": {"type": "ephemeral"},  # cache the system prompt
            }
        ],
        tools=[_TOOL],
        tool_choice={"type": "tool", "name": "record_event"},
        messages=[{"role": "user", "content": user_message}],
    )

    # Extract the tool call result
    tool_block = next(
        (b for b in response.content if b.type == "tool_use"),
        None,
    )
    if tool_block is None:
        raise RuntimeError("LLM did not call record_event tool")

    raw: dict = tool_block.input  # type: ignore[union-attr]

    geo = GeolocationSignal.model_validate(raw.get("geolocation_signals", {}))
    event = ExtractedEvent(
        has_event=raw["has_event"],
        skip_reason=raw.get("skip_reason"),
        event_type=raw.get("event_type"),
        occurred_at=raw.get("occurred_at"),
        location_name=raw.get("location_name"),
        oblast=raw.get("oblast"),
        lat=raw.get("lat"),
        lng=raw.get("lng"),
        actor=raw.get("actor"),
        description=raw.get("description"),
        geolocation_signals=geo,
        is_high_impact=raw.get("is_high_impact", False),
    )

    llm_meta = {
        "model": response.model,
        "prompt": user_message,
        "response": json.dumps(raw),
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
    }

    log.debug(
        "extraction_complete",
        has_event=event.has_event,
        event_type=event.event_type,
        location=event.location_name,
        cache_read=getattr(response.usage, "cache_read_input_tokens", 0),
    )

    return event, llm_meta
