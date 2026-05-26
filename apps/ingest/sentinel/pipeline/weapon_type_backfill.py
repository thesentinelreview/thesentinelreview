"""
One-shot backfill: classify weapon_type for historical events that predate the
weapon_type extractor (migration 0017 / PR #135).

For each event with weapon_type IS NULL we re-run the *live* extractor on the
event's PRIMARY source post and copy the resulting weapon_type onto the event,
so backfilled values are produced by exactly the same prompt + tool schema as
live extraction (and therefore include the `aircraft` class added in PR #136).

Idempotent on success: the fetch filters on `events.weapon_type IS NULL`, so a
re-run skips events already classified. NOTE: an event with no identifiable
kinetic capability also stays NULL — a valid terminal state, indistinguishable
from "not yet processed" — so a re-run WILL re-classify those. Treat this as a
one-shot op bounded by SENTINEL_BACKFILL_DAYS / SENTINEL_BACKFILL_MAX_EVENTS
rather than something to run on a schedule.

Only events that have a 'primary' event_sources row pointing at a raw_post are
backfillable (we need the original post text to re-extract); events without one
are not selected.

Configured via env vars:
  SENTINEL_BACKFILL_DAYS         (default 30)   — only events with occurred_at in this window
  SENTINEL_BACKFILL_RATE_LIMIT   (default 4.0)  — max extract_event calls per second
  SENTINEL_BACKFILL_BATCH_SIZE   (default 100)  — events fetched per DB roundtrip
  SENTINEL_BACKFILL_MAX_EVENTS   (default 0)    — safety cap; 0 means no cap
  SENTINEL_BACKFILL_THEATER      (default "")   — restrict to one theater; "" = all

Designed to run from GitHub Actions via the sentinel-backfill-weapon-type
workflow, but importable for local invocation or unit tests.
"""
from __future__ import annotations

import os
import time
import uuid
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field

import psycopg
import structlog

from sentinel.db import get_conn, log_llm_call, update_event_weapon_type
from sentinel.pipeline.extractor import extract_event

log = structlog.get_logger()

# Extractor prompts are theater-keyed; an event inherits the theater of its
# primary source (same basis the live pipeline and the dry-run use). First match
# in this order wins for multi-theater sources.
THEATERS: tuple[str, ...] = ("ukraine", "iran", "sudan", "myanmar")


@dataclass
class BackfillStats:
    """Summary of one weapon_type backfill run. Useful for tests and operator review."""
    considered: int = 0                                  # events pulled from the DB
    classified: int = 0                                  # got a concrete weapon_type, persisted
    null:       int = 0                                  # re-extraction found an event but no weapon
    no_event:   int = 0                                  # re-extraction no longer finds an event
    failed:     int = 0                                  # extractor raised
    dist: Counter[str] = field(default_factory=Counter)  # weapon_type -> count (classified only)


def _config() -> dict:
    raw_theater = os.environ.get("SENTINEL_BACKFILL_THEATER", "").strip().lower()
    theater = raw_theater or None
    if theater is not None and theater not in THEATERS:
        log.warning("weapon_backfill_unknown_theater", given=raw_theater, valid=list(THEATERS))
        theater = None
    return {
        "days":       int(os.environ.get("SENTINEL_BACKFILL_DAYS", "30")),
        "rate_rps":   float(os.environ.get("SENTINEL_BACKFILL_RATE_LIMIT", "4.0")),
        "batch_size": int(os.environ.get("SENTINEL_BACKFILL_BATCH_SIZE", "100")),
        "max_events": int(os.environ.get("SENTINEL_BACKFILL_MAX_EVENTS", "0")),
        "theater":    theater,
    }


def _fetch_batch(
    conn: psycopg.Connection,
    *,
    days: int,
    batch_size: int,
    theater: str | None,
    after_id: uuid.UUID | None,
) -> list[dict]:
    """
    Pull a batch of un-classified events joined to their primary source post.

    Keyset-paginated by event id so a long-running backfill processes each event
    exactly once. DISTINCT ON keeps the earliest primary link when an event has
    more than one. Filtering on `weapon_type IS NULL` makes successful runs
    idempotent.
    """
    params: list = [days]
    theater_clause = ""
    if theater is not None:
        theater_clause = "AND %s = ANY (s.theaters)"
        params.append(theater)
    keyset_clause = ""
    if after_id is not None:
        keyset_clause = "AND e.id > %s"
        params.append(after_id)
    params.append(batch_size)

    sql = f"""
        SELECT DISTINCT ON (e.id)
               e.id               AS event_id,
               rp.id              AS raw_post_id,
               rp.text            AS text,
               rp.translated_text AS translated_text,
               rp.posted_at       AS posted_at,
               s.display_name     AS display_name,
               s.platform         AS platform,
               s.trust_tier       AS trust_tier,
               s.theaters         AS theaters
        FROM events e
        JOIN event_sources es
          ON es.event_id = e.id
         AND es.relationship = 'primary'
         AND es.raw_post_id IS NOT NULL
        JOIN raw_posts rp ON rp.id = es.raw_post_id
        JOIN sources s    ON s.id = es.source_id
        WHERE e.weapon_type IS NULL
          AND e.occurred_at > now() - (%s * INTERVAL '1 day')
          {theater_clause}
          {keyset_clause}
        ORDER BY e.id ASC, es.created_at ASC
        LIMIT %s
    """
    return conn.execute(sql, tuple(params)).fetchall()  # type: ignore[return-value]


def _iter_events(
    conn: psycopg.Connection,
    *,
    days: int,
    batch_size: int,
    max_events: int,
    theater: str | None,
) -> Iterator[dict]:
    after_id: uuid.UUID | None = None
    yielded = 0
    while True:
        rows = _fetch_batch(
            conn, days=days, batch_size=batch_size, theater=theater, after_id=after_id
        )
        if not rows:
            return
        for row in rows:
            yield row
            yielded += 1
            if max_events and yielded >= max_events:
                return
        after_id = rows[-1]["event_id"]


def _pick_theater(theaters: list[str] | None) -> str:
    """Map a source's theater list to the extractor prompt key (first match wins)."""
    for t in THEATERS:
        if theaters and t in theaters:
            return t
    return "ukraine"


def _process_one(
    conn: psycopg.Connection,
    *,
    event: dict,
    stats: BackfillStats,
) -> None:
    """Re-classify one event and persist its weapon_type. Never raises."""
    text = event["translated_text"] or event["text"]
    source = {
        "display_name": event["display_name"],
        "platform": event["platform"],
        "trust_tier": event["trust_tier"],
    }
    theater = _pick_theater(event.get("theaters"))

    try:
        extracted, llm_meta = extract_event(
            text,
            source=source,
            theater=theater,
            post_timestamp=event["posted_at"],
        )
    except Exception:
        log.exception("weapon_backfill_extract_failed", event_id=str(event["event_id"]))
        stats.failed += 1
        return

    log_llm_call(
        conn,
        purpose="weapon_type_backfill",
        model=llm_meta["model"],
        prompt=llm_meta["prompt"],
        response=llm_meta["response"],
        prompt_tokens=llm_meta.get("prompt_tokens"),
        completion_tokens=llm_meta.get("completion_tokens"),
        job_id=None,
        raw_post_id=event["raw_post_id"],
    )

    if not extracted.has_event:
        stats.no_event += 1
    elif extracted.weapon_type is None:
        stats.null += 1
    else:
        update_event_weapon_type(conn, event["event_id"], weapon_type=extracted.weapon_type)
        stats.classified += 1
        stats.dist[extracted.weapon_type] += 1

    conn.commit()


def run_backfill(conn: psycopg.Connection | None = None) -> BackfillStats:
    """
    Execute the backfill. If `conn` is None, opens its own connection.

    Returns BackfillStats so callers (the GitHub Actions wrapper, tests) can log
    the final tally.
    """
    cfg = _config()
    log.info("weapon_backfill_start", **cfg)

    stats = BackfillStats()
    next_call_at = time.monotonic()
    interval = 1.0 / cfg["rate_rps"] if cfg["rate_rps"] > 0 else 0.0

    own_conn = conn is None
    if own_conn:
        conn_ctx = get_conn()
        conn = conn_ctx.__enter__()
    try:
        for event in _iter_events(
            conn,
            days=cfg["days"],
            batch_size=cfg["batch_size"],
            max_events=cfg["max_events"],
            theater=cfg["theater"],
        ):
            stats.considered += 1

            # Rate-limit every extract call (the only LLM cost here).
            now = time.monotonic()
            if now < next_call_at:
                time.sleep(next_call_at - now)
            next_call_at = time.monotonic() + interval

            _process_one(conn, event=event, stats=stats)

            if stats.considered % 100 == 0:
                log.info(
                    "weapon_backfill_progress",
                    considered=stats.considered,
                    classified=stats.classified,
                    null=stats.null,
                    no_event=stats.no_event,
                    failed=stats.failed,
                )
    finally:
        if own_conn:
            conn_ctx.__exit__(None, None, None)  # type: ignore[union-attr]

    log.info(
        "weapon_backfill_complete",
        considered=stats.considered,
        classified=stats.classified,
        null=stats.null,
        no_event=stats.no_event,
        failed=stats.failed,
    )
    return stats
