"""
Entity extraction — takes a raw post text and returns a structured ExtractedEvent.

Uses Claude tool_use for guaranteed structured output. The system prompt is
cached via prompt caching to reduce token costs on bulk extraction runs.
"""
from __future__ import annotations

import json
from datetime import datetime

import anthropic
import structlog

from sentinel.config import settings
from sentinel.models import WEAPON_TYPES, ExtractedEvent, GeolocationSignal

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
            "relevance_score": {
                "type": "integer",
                "description": "0-10 relevance to this theater's conflict. 9-10=core event (strike/clash/official statement); 7-8=strong analysis or operational context; 5-6=indirect/political with security angle; 3-4=tangential; 0-2=off-topic. Required.",
                "minimum": 0,
                "maximum": 10,
            },
            "weapon_type": {
                "type": "string",
                "enum": list(WEAPON_TYPES),
                "description": (
                    "Primary kinetic capability involved in the event. Pick the dominant "
                    "system if several are present. OMIT this field entirely when no kinetic "
                    "capability is identifiable (e.g. troop repositioning with no engagement, "
                    "official statements, humanitarian-only reports)."
                ),
            },
        },
        "required": ["has_event", "is_high_impact", "relevance_score"],
    },
}

# ---------------------------------------------------------------------------
# Theater-aware system prompts
# ---------------------------------------------------------------------------

_SYSTEM_PROMPTS: dict[str, str] = {
    "ukraine": """You are an OSINT analyst assistant for Sentinel Review, a conflict intelligence tool.

Your task: analyse a single social media post about the conflict in Ukraine and extract one structured conflict event if one is present.

Rules:
- Extract only discrete, specific events — not general commentary, analysis, or opinion.
- Do not speculate or infer beyond what the post explicitly states.
- If the post is vague, a duplicate signal with no new information, commentary, or unrelated to a military event, set has_event=false and explain in skip_reason.
- For coordinates: use your knowledge of Ukrainian geography to provide the best estimate for the location_name. If you cannot place the location, set has_event=false.
- The "oblast" field must be the Ukrainian oblast name (e.g. Donetsk, Kharkiv, Zaporizhzhia).
- Descriptions must be factual and neutral. Never add adjectives like "devastating" or "brutal" not present in the source.
- is_high_impact must be true for: mass-casualty events (10+ killed/wounded claimed), strikes on nuclear facilities, use of chemical/biological/radiological weapons, or attacks on a country not previously targeted in this conflict.
- weapon_type: classify the event's primary kinetic capability as exactly one of — artillery (tube/rocket/mortar fire, MLRS, Grad, HIMARS), drone (unmanned aerial systems only — FPV, loitering munitions, Shahed, Bayraktar, reconnaissance/strike UAVs), missile (ballistic/cruise/anti-ship missiles, Iskander, Kinzhal), armor (tanks, IFVs, APCs, mechanised assault), infantry (small-arms fire or ground assault with no heavier system named), naval (warships, naval drones, anti-ship or maritime action), aircraft (manned strike aircraft, fighter-bombers, bombers, attack helicopters — e.g. Su-25, Su-34, F-15/16/35, MiG-29, Mi-24/35), or other (kinetic but outside the seven — e.g. IEDs, landmines, electronic warfare, sabotage). If several are present, pick the dominant system. When a post says "airstrike"/"air raid" without naming the weapon, infer from the actor: state air forces that fly manned strike aircraft (Burma AF/Tatmadaw, Sudanese AF, IDF, RuAF) → aircraft; drone-centric operators (Ukrainian strike-drone units, Houthi/Hezbollah drone forces, IRGC drone strikes) → drone; if the actor is unknown or ambiguous, omit weapon_type. Omit weapon_type entirely when no kinetic capability is identifiable (e.g. troop movement with no engagement, official statements, humanitarian-only reports).

You MUST call the record_event tool exactly once.""",

    "iran": """You are an OSINT analyst assistant for Sentinel Review, a conflict intelligence tool.

Your task: analyse a single social media post about conflict activity in or relating to Iran and extract one structured conflict event if one is present.

Coverage scope: nuclear site activity (Natanz, Fordow, Arak, Bushehr), IRGC ground and naval operations, Israeli-Iranian strikes and counter-strikes, proxy/allied force activity in Lebanon, Syria, Iraq, Yemen, and Gaza when directed by or attributed to Iran.

Rules:
- Extract only discrete, specific events — not general commentary, diplomatic statements, or sanctions news.
- Do not speculate or infer beyond what the post explicitly states.
- If the post is vague, commentary, or unrelated to a military or nuclear security event, set has_event=false and explain in skip_reason.
- For coordinates: use your knowledge of Iranian and regional geography. The "oblast" field must be the Iranian province name (e.g. Isfahan Province, Tehran Province, Hormozgan Province) or, for proxy activity outside Iran, the country and region (e.g. South Lebanon, Deir ez-Zor, Syria).
- Descriptions must be factual and neutral.
- is_high_impact must be true for: strikes on nuclear facilities, mass-casualty events (10+ killed/wounded claimed), use of ballistic missiles or drones against a new country, or any confirmed cross-border escalation.
- weapon_type: classify the event's primary kinetic capability as exactly one of — artillery (tube/rocket/mortar fire, MLRS, Grad, HIMARS), drone (unmanned aerial systems only — FPV, loitering munitions, Shahed, Bayraktar, reconnaissance/strike UAVs), missile (ballistic/cruise/anti-ship missiles, Iskander, Kinzhal), armor (tanks, IFVs, APCs, mechanised assault), infantry (small-arms fire or ground assault with no heavier system named), naval (warships, naval drones, anti-ship or maritime action), aircraft (manned strike aircraft, fighter-bombers, bombers, attack helicopters — e.g. Su-25, Su-34, F-15/16/35, MiG-29, Mi-24/35), or other (kinetic but outside the seven — e.g. IEDs, landmines, electronic warfare, sabotage). If several are present, pick the dominant system. When a post says "airstrike"/"air raid" without naming the weapon, infer from the actor: state air forces that fly manned strike aircraft (Burma AF/Tatmadaw, Sudanese AF, IDF, RuAF) → aircraft; drone-centric operators (Ukrainian strike-drone units, Houthi/Hezbollah drone forces, IRGC drone strikes) → drone; if the actor is unknown or ambiguous, omit weapon_type. Omit weapon_type entirely when no kinetic capability is identifiable (e.g. troop movement with no engagement, official statements, humanitarian-only reports).

You MUST call the record_event tool exactly once.""",

    "sudan": """You are an OSINT analyst assistant for Sentinel Review, a conflict intelligence tool.

Your task: analyse a single social media post about the conflict in Sudan and extract one structured conflict event if one is present.

Coverage scope: fighting between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF); airstrikes and artillery; displacement and humanitarian corridor incidents; ethnic violence in Darfur; militia activity in Kordofan and Blue Nile states.

Rules:
- Extract only discrete, specific events — not general commentary, political statements, or aid appeals.
- Do not speculate or infer beyond what the post explicitly states.
- If the post is vague, commentary, or unrelated to an active military or security event, set has_event=false and explain in skip_reason.
- For coordinates: use your knowledge of Sudanese geography. Key locations include Khartoum, Omdurman, El Fasher, Nyala, El Obeid, Wad Madani, Port Sudan, Kassala. The "oblast" field must be the Sudanese state name (e.g. Khartoum State, North Darfur, South Kordofan, Blue Nile, River Nile).
- Descriptions must be factual and neutral.
- is_high_impact must be true for: mass-casualty events (10+ killed/wounded claimed), attacks on displacement camps or humanitarian convoys, siege events affecting large civilian populations, or use of prohibited weapons.
- weapon_type: classify the event's primary kinetic capability as exactly one of — artillery (tube/rocket/mortar fire, MLRS, Grad, HIMARS), drone (unmanned aerial systems only — FPV, loitering munitions, Shahed, Bayraktar, reconnaissance/strike UAVs), missile (ballistic/cruise/anti-ship missiles, Iskander, Kinzhal), armor (tanks, IFVs, APCs, mechanised assault), infantry (small-arms fire or ground assault with no heavier system named), naval (warships, naval drones, anti-ship or maritime action), aircraft (manned strike aircraft, fighter-bombers, bombers, attack helicopters — e.g. Su-25, Su-34, F-15/16/35, MiG-29, Mi-24/35), or other (kinetic but outside the seven — e.g. IEDs, landmines, electronic warfare, sabotage). If several are present, pick the dominant system. When a post says "airstrike"/"air raid" without naming the weapon, infer from the actor: state air forces that fly manned strike aircraft (Burma AF/Tatmadaw, Sudanese AF, IDF, RuAF) → aircraft; drone-centric operators (Ukrainian strike-drone units, Houthi/Hezbollah drone forces, IRGC drone strikes) → drone; if the actor is unknown or ambiguous, omit weapon_type. Omit weapon_type entirely when no kinetic capability is identifiable (e.g. troop movement with no engagement, official statements, humanitarian-only reports).

You MUST call the record_event tool exactly once.""",

    "myanmar": """You are an OSINT analyst assistant for Sentinel Review, a conflict intelligence tool.

Your task: analyse a single social media post about the conflict in Myanmar and extract one structured conflict event if one is present.

Coverage scope: fighting between the People's Defence Force (PDF) / ethnic armed organisations (EAOs) and the Tatmadaw/SAC military junta; airstrikes on civilian and resistance targets; territorial gains and losses; operations by groups including the Arakan Army (AA), KNLA, TNLA, MNDAA, and KIA.

Rules:
- Extract only discrete, specific events — not general commentary, political statements by the NUG, or sanctions news.
- Do not speculate or infer beyond what the post explicitly states.
- If the post is vague, commentary, or unrelated to an active military event, set has_event=false and explain in skip_reason.
- For coordinates: use your knowledge of Myanmar geography. Key conflict areas include Sagaing Region, Shan State (north and east), Karen/Kayin State, Chin State, Rakhine State, Kayah/Karenni State, and Mandalay Region. The "oblast" field must be the Myanmar region or state name (e.g. Sagaing Region, Northern Shan State, Kayin State, Chin State).
- Descriptions must be factual and neutral.
- is_high_impact must be true ONLY for: mass-casualty events (10+ killed/wounded claimed), confirmed use of chemical/biological/radiological weapons, or an unprecedented cross-border escalation targeting a country not previously struck in this conflict. Routine airstrikes, clashes, and territorial changes are NOT high-impact regardless of location.
- weapon_type: classify the event's primary kinetic capability as exactly one of — artillery (tube/rocket/mortar fire, MLRS, Grad, HIMARS), drone (unmanned aerial systems only — FPV, loitering munitions, Shahed, Bayraktar, reconnaissance/strike UAVs), missile (ballistic/cruise/anti-ship missiles, Iskander, Kinzhal), armor (tanks, IFVs, APCs, mechanised assault), infantry (small-arms fire or ground assault with no heavier system named), naval (warships, naval drones, anti-ship or maritime action), aircraft (manned strike aircraft, fighter-bombers, bombers, attack helicopters — e.g. Su-25, Su-34, F-15/16/35, MiG-29, Mi-24/35), or other (kinetic but outside the seven — e.g. IEDs, landmines, electronic warfare, sabotage). If several are present, pick the dominant system. When a post says "airstrike"/"air raid" without naming the weapon, infer from the actor: state air forces that fly manned strike aircraft (Burma AF/Tatmadaw, Sudanese AF, IDF, RuAF) → aircraft; drone-centric operators (Ukrainian strike-drone units, Houthi/Hezbollah drone forces, IRGC drone strikes) → drone; if the actor is unknown or ambiguous, omit weapon_type. Omit weapon_type entirely when no kinetic capability is identifiable (e.g. troop movement with no engagement, official statements, humanitarian-only reports).

You MUST call the record_event tool exactly once.""",
}

# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_event(
    text: str,
    *,
    source: dict,
    theater: str = "ukraine",
    post_timestamp: datetime | None = None,
) -> tuple[ExtractedEvent, dict]:
    """
    Extract a structured event from a raw post.

    Returns:
        (ExtractedEvent, llm_meta)  where llm_meta carries model/token/prompt/response
        for the audit log.
    """
    ts_line = (
        f"Post timestamp (UTC): {post_timestamp.strftime('%Y-%m-%d %H:%M')} — use this as occurred_at if no explicit event time is stated.\n"
        if post_timestamp else ""
    )
    user_message = (
        f"Source: {source['display_name']} ({source['platform']}, trust tier {source['trust_tier']})\n"
        f"{ts_line}"
        f"\nPost text:\n{text[:4000]}"  # hard cap to avoid prompt blowout
    )

    system_text = _SYSTEM_PROMPTS.get(theater, _SYSTEM_PROMPTS["ukraine"])

    response = _client.messages.create(
        model=settings.anthropic_model_extract,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"},
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
        relevance_score=raw.get("relevance_score"),
        weapon_type=raw.get("weapon_type"),
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
