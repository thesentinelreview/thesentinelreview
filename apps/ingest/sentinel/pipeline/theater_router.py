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

THEATERS: tuple[str, ...] = ("ukraine", "iran", "sudan", "myanmar", "israel", "russia", "nato_flank")

# Returned (not in THEATERS) when the router glitches — a missing/invalid tool
# call or an exception. The caller still extracts the post under a generic scope
# instead of dropping it or mislabelling it ukraine. Never persisted to the DB.
UNKNOWN_THEATER = "unknown"

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

The five theaters and what counts as related:
- ukraine: the Russia–Ukraine war (including strikes inside Russia and Black Sea naval action).
- iran: Iran-related military or nuclear activity — IRGC ground/naval operations, the Strait of Hormuz, US/CENTCOM strikes on Iran, and Iran-directed proxy activity in Lebanon (Hezbollah), Syria, Iraq, and Yemen (Houthis). Israel–Iran strikes and counter-strikes belong here ONLY when the event itself occurs outside Israel/Gaza/the West Bank (e.g. an Israeli strike on Iranian or Hezbollah targets in Iran, Syria, or Lebanon).
- israel: events physically located in Israel, the Gaza Strip, or the West Bank — Israeli (IDF) operations in Gaza/West Bank, Hamas/PIJ activity, and any strike that LANDS on Israeli/Gaza/West Bank soil (including Iranian or Hezbollah missiles/rockets hitting Israel).
- sudan: the SAF–RSF civil war (Khartoum, Darfur, Kordofan, etc.).
- myanmar: the post-coup civil war — Tatmadaw/SAC junta vs the PDF and ethnic armed organisations (Arakan Army, KNLA, TNLA, MNDAA, KIA).

Routing rules:
- Route by the CONTENT of the post, not its source. A source that usually covers one theater can post about another.
- iran vs israel is decided by WHERE the event happens, not who fired. A strike that lands in Israel/Gaza/the West Bank is israel; the same exchange's strikes landing in Iran, Syria, or Lebanon are iran. When a single post describes both directions, pick the theater of the event it primarily reports.
- A "primary theater hint" is provided (the source's usual coverage). Use it ONLY to break genuine ties — never to override clear content. If the post is clearly about Iran, answer iran even when the hint is ukraine.
- Bias toward inclusion. If the post plausibly relates to any theater, route it there and let the downstream prompt decide. Answer 'none' ONLY when you are confident the post is not about armed conflict in or related to any of the five theaters (e.g. US domestic politics, sports, unrelated business or technology news).
- Diplomacy, sanctions, and commentary ABOUT a theater still belong to that theater — route them there (the downstream prompt handles scope). They are NOT 'none'.

Call set_theater exactly once."""


def classify_theater(
    text: str, *, source: dict, post_id: object | None = None
) -> tuple[str | None, dict]:
    """Route a post to a theater from its content.

    Returns (theater, llm_meta). ``theater`` is one of THEATERS, ``None`` when the
    post is confidently off all five theaters (the caller should skip without
    extracting), or ``UNKNOWN_THEATER`` on a router glitch/exception (the caller
    should still extract, under a generic scope — never drop, never mislabel as
    ukraine). ``llm_meta`` is the audit-log payload for log_llm_call. ``post_id``
    is included in warnings so a router regression is traceable to the post.
    """
    theaters = source.get("theaters") or []
    prior = theaters[0] if theaters else UNKNOWN_THEATER
    pid = str(post_id) if post_id is not None else None
    user_message = (
        f"Primary theater hint (source's usual coverage): {prior}\n\n"
        f"Post text:\n{text[:2000]}"
    )

    try:
        response = _client.messages.create(
            model=settings.anthropic_model_classify,
            max_tokens=128,
            system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "set_theater"},
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as exc:
        # Router exception (API/transport error): resolve to UNKNOWN so the post is
        # still extracted under a generic scope — never dropped, never ukraine.
        log.warning(
            "theater_router_error",
            error=f"{type(exc).__name__}: {exc}",
            post_id=pid,
            resolved=UNKNOWN_THEATER,
        )
        return UNKNOWN_THEATER, {
            "model": settings.anthropic_model_classify,
            "prompt": user_message,
            "response": f"<error: {type(exc).__name__}>",
            "prompt_tokens": None,
            "completion_tokens": None,
        }

    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    choice = (tool_block.input or {}).get("theater") if tool_block is not None else None

    theater: str | None
    if choice in THEATERS:
        theater = choice
    elif choice == "none":
        theater = None
    else:
        # Missing/unexpected value (incl. no tool call): resolve to UNKNOWN (NOT
        # ukraine) so a router glitch never silently mislabels a post. The caller
        # still extracts it under the generic scope.
        theater = UNKNOWN_THEATER
        log.warning(
            "theater_router_unexpected_choice",
            choice=choice,
            post_id=pid,
            resolved=UNKNOWN_THEATER,
        )

    llm_meta = {
        "model": response.model,
        "prompt": user_message,
        "response": str(choice),
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
    }
    log.debug("theater_routed", source=source.get("handle"), prior=prior, theater=theater, post_id=pid)
    return theater, llm_meta
