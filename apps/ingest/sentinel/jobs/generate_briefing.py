"""
generate_briefing job
---------------------
Pulls the last N hours of verified/partial events, builds structured input
for the LLM, generates a draft briefing, and saves it to the briefings table.

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
    period_start = period_end - timedelta(hours=params.period_hours)

    events = get_recent_events(conn, hours=params.period_hours, theater=params.theater)

    if not events:
        log.info("no_events_for_briefing", theater=params.theater, hours=params.period_hours)
        return

    log.info("generating_briefing", event_count=len(events), theater=params.theater)

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
    from sentinel.db import _THEATER_BBOX
    bbox = _THEATER_BBOX.get(theater, _THEATER_BBOX["ukraine"])
    min_lng, min_lat, max_lng, max_lat = bbox
    rows = conn.execute(
        """
        SELECT oblast, COUNT(*)::float / 7 AS avg_per_day
        FROM events
        WHERE occurred_at > now() - interval '7 days'
          AND confidence IN ('verified', 'partial')
          AND ST_Within(location, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
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
