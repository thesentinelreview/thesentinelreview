"""
generate_briefing job
---------------------
Selects events for the theater via a confidence/window cascade (recent
verified/partial -> recent all-confidence -> 7-day verified/partial -> 7-day
all-confidence), builds structured input for the LLM, generates a draft
briefing, and saves it to the briefings table.

Saves directly as status='published' — briefings go live immediately on creation.

Payload schema: GenerateBriefingPayload
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import psycopg
import structlog

from sentinel.db import get_recent_events, insert_briefing, log_llm_call
from sentinel.models import BriefingInput, GenerateBriefingPayload
from sentinel.pipeline.briefing import generate_briefing_draft

log = structlog.get_logger()


def run(conn: psycopg.Connection, *, job_id: uuid.UUID, payload: dict) -> None:
    params = GenerateBriefingPayload.model_validate(payload)

    period_end = datetime.now(tz=timezone.utc)

    # Confidence/window cascade: prefer recent corroborated events, but fall back
    # through unconfirmed and a 7-day window so quiet theaters (Iran, Sudan) still
    # get a briefing instead of being silently skipped. The CONFIDENCE BREAKDOWN in
    # the UI plus the standing "not for operational use" disclaimer cover the lower
    # tiers, so no separate draft-gating is applied.
    verified_partial = ("verified", "partial")
    all_confidence = ("verified", "partial", "unconfirmed")
    week_hours = 24 * 7
    tiers = [
        (params.period_hours, verified_partial, f"{params.period_hours}h+verified"),
        (params.period_hours, all_confidence, f"{params.period_hours}h+unconfirmed"),
        (week_hours, verified_partial, "7d+verified"),
        (week_hours, all_confidence, "7d+unconfirmed"),
    ]

    events: list = []
    tier_label = "none"
    window_hours = params.period_hours
    for hrs, confidence, label in tiers:
        events = get_recent_events(conn, hours=hrs, theater=params.theater, confidence=confidence)
        if events:
            tier_label, window_hours = label, hrs
            break

    # One line per theater per cycle showing which tier produced the briefing.
    log.info(
        "briefing_event_selection", theater=params.theater, tier=tier_label, events=len(events)
    )

    if not events:
        return

    period_start = period_end - timedelta(hours=window_hours)
    log.info(
        "generating_briefing", event_count=len(events), theater=params.theater, tier=tier_label
    )

    # Build 7-day baseline per oblast for context
    baseline = _compute_baseline(conn, theater=params.theater)

    briefing_input = BriefingInput(
        theater=params.theater,
        period_start=period_start,
        period_end=period_end,
        events=[dict(e) for e in events],
        baseline_7d=baseline,
        notable_shifts=_notable_shifts(events, baseline),
    )

    result, llm_meta = generate_briefing_draft(briefing_input)

    briefing_id = insert_briefing(
        conn,
        theater=params.theater,
        period_start=period_start,
        period_end=period_end,
        draft_text=result.draft_text,
        event_ids=result.referenced_event_ids,
        prompt_tokens=llm_meta.get("prompt_tokens"),
        completion_tokens=llm_meta.get("completion_tokens"),
    )

    log_llm_call(
        conn,
        purpose="briefing",
        model=llm_meta["model"],
        prompt=llm_meta["prompt"],
        response=llm_meta["response"],
        prompt_tokens=llm_meta.get("prompt_tokens"),
        completion_tokens=llm_meta.get("completion_tokens"),
        job_id=job_id,
        briefing_id=briefing_id,
    )

    conn.commit()
    log.info("briefing_created", briefing_id=str(briefing_id), event_count=len(events))


def _compute_baseline(conn: psycopg.Connection, *, theater: str) -> dict:
    """Average events per day per oblast over the last 7 days."""
    from sentinel.db import _THEATER_BBOX, _iran_israel_carve_sql
    bbox = _THEATER_BBOX.get(theater)
    if bbox is None:
        # No silent ukraine fallback — surface the misconfiguration instead.
        log.warning("compute_baseline_unknown_theater", theater=theater)
        return {}
    min_lng, min_lat, max_lng, max_lat = bbox
    carve = _iran_israel_carve_sql(theater, "location")
    rows = conn.execute(
        f"""
        SELECT oblast, COUNT(*)::float / 7 AS avg_per_day
        FROM events
        WHERE occurred_at > now() - interval '7 days'
          AND confidence IN ('verified', 'partial')
          AND ST_Within(location, ST_MakeEnvelope(%s, %s, %s, %s, 4326)){carve}
        GROUP BY oblast
        ORDER BY avg_per_day DESC
        """,
        (min_lng, min_lat, max_lng, max_lat),
    ).fetchall()
    return {row["oblast"]: round(row["avg_per_day"], 1) for row in rows}


def _notable_shifts(events: list, baseline: dict) -> list[str]:
    """Simple per-oblast comparison against 7d baseline."""
    from collections import Counter
    today_count = Counter(e["oblast"] for e in events)
    shifts = []
    for oblast, count in today_count.most_common():
        avg = baseline.get(oblast, 0)
        if avg > 0:
            delta_pct = round((count - avg) / avg * 100)
            if abs(delta_pct) >= 20:
                direction = "up" if delta_pct > 0 else "down"
                shifts.append(
                    f"{oblast}: {count} events ({direction} {abs(delta_pct)}% vs 7d avg of {avg}/day)"
                )
        elif count > 0:
            shifts.append(f"{oblast}: {count} events (no prior baseline)")
    return shifts
