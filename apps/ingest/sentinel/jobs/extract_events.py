"""
extract_events job
------------------
Takes a batch of raw_posts, runs LLM entity extraction on each, deduplicates
against existing events, scores confidence, and writes to the events table.

Payload schema: ExtractEventsPayload
"""
from __future__ import annotations

import uuid

import psycopg
import structlog

from sentinel.db import (
    get_posts_by_ids,
    get_source,
    insert_event,
    link_event_source,
    log_llm_call,
    mark_post_processed,
)
from sentinel.models import ExtractEventsPayload, TheaterKey
from sentinel.pipeline.dedup import find_duplicate
from sentinel.pipeline.extractor import extract_event
from sentinel.pipeline.scorer import score_confidence

log = structlog.get_logger()


def run(conn: psycopg.Connection, *, job_id: uuid.UUID, payload: dict) -> None:
    params = ExtractEventsPayload.model_validate(payload)
    posts = get_posts_by_ids(conn, params.raw_post_ids)
    source = get_source(conn, params.source_id)
    if source is None:
        raise ValueError(f"Source not found: {params.source_id}")

    theater: str = params.theater or source.get("theater", "ukraine")
    log.info("extracting_events", post_count=len(posts), source=source["handle"], theater=theater)

    for post in posts:
        _process_post(conn, post=post, source=source, job_id=job_id, theater=theater)

    conn.commit()


def _process_post(
    conn: psycopg.Connection,
    *,
    post: dict,
    source: dict,
    job_id: uuid.UUID,
    theater: str = "ukraine",
) -> None:
    post_id: uuid.UUID = post["id"]

    # ── LLM extraction ───────────────────────────────────────────────────────
    result, llm_meta = extract_event(post["text"], source=source, theater=theater)

    log_llm_call(
        conn,
        purpose="entity_extraction",
        model=llm_meta["model"],
        prompt=llm_meta["prompt"],
        response=llm_meta["response"],
        prompt_tokens=llm_meta.get("prompt_tokens"),
        completion_tokens=llm_meta.get("completion_tokens"),
        job_id=job_id,
        raw_post_id=post_id,
    )

    if not result.has_event:
        mark_post_processed(conn, post_id, skip_reason=result.skip_reason or "no_event_signal")
        log.debug("post_skipped", post_id=str(post_id), reason=result.skip_reason)
        return

    # All required fields must be present
    if not all([result.event_type, result.occurred_at, result.lat, result.lng,
                result.location_name, result.oblast, result.description]):
        mark_post_processed(conn, post_id, skip_reason="incomplete_extraction")
        log.warning("incomplete_extraction", post_id=str(post_id))
        return

    # ── Deduplication ────────────────────────────────────────────────────────
    duplicate_id = find_duplicate(
        conn,
        lng=result.lng,         # type: ignore[arg-type]
        lat=result.lat,         # type: ignore[arg-type]
        occurred_at=result.occurred_at,
        event_type=result.event_type,  # type: ignore[arg-type]
    )

    if duplicate_id:
        # Corroborate the existing event rather than creating a new one
        log.info("event_corroborated", existing_id=str(duplicate_id), post_id=str(post_id))
        link_event_source(
            conn,
            event_id=duplicate_id,
            source_id=source["id"],
            raw_post_id=post_id,
            relationship="corroborating",
        )
        _maybe_upgrade_confidence(conn, event_id=duplicate_id)
        mark_post_processed(conn, post_id)
        return

    # ── Confidence scoring ───────────────────────────────────────────────────
    assessment = score_confidence(
        source=source,
        geo_signals=result.geolocation_signals,
        corroborating_sources=[],   # no other sources yet for a brand-new event
        is_high_impact=result.is_high_impact,
    )

    # ── Insert new event ─────────────────────────────────────────────────────
    event_id = insert_event(
        conn,
        event_type=result.event_type,   # type: ignore[arg-type]
        occurred_at=result.occurred_at,
        lng=result.lng,                 # type: ignore[arg-type]
        lat=result.lat,                 # type: ignore[arg-type]
        location_name=result.location_name,
        oblast=result.oblast,
        actor=result.actor,
        description=result.description,
        confidence=assessment.confidence,
        held_for_review=assessment.held_for_review,
    )

    link_event_source(
        conn,
        event_id=event_id,
        source_id=source["id"],
        raw_post_id=post_id,
        relationship="primary",
    )

    mark_post_processed(conn, post_id)

    log.info(
        "event_created",
        event_id=str(event_id),
        event_type=result.event_type,
        location=result.location_name,
        confidence=assessment.confidence,
        held=assessment.held_for_review,
    )


def _maybe_upgrade_confidence(conn: psycopg.Connection, event_id: uuid.UUID) -> None:
    """Re-score an event's confidence now that it has an additional corroborating source."""
    row = conn.execute(
        """
        SELECT
            e.confidence,
            e.held_for_review,
            COUNT(DISTINCT es.source_id)                             AS source_count,
            COUNT(DISTINCT s.platform)                               AS platform_count,
            MAX(s.trust_tier)                                        AS min_trust_tier
        FROM events e
        JOIN event_sources es ON es.event_id = e.id
        JOIN sources s        ON s.id = es.source_id
        WHERE e.id = %s
        GROUP BY e.id, e.confidence, e.held_for_review
        """,
        (event_id,),
    ).fetchone()

    if row is None:
        return

    source_count: int = row["source_count"]
    platform_count: int = row["platform_count"]

    new_confidence: str
    if source_count >= 2 and platform_count >= 2:
        new_confidence = "verified"
    elif source_count >= 2:
        new_confidence = "partial"
    else:
        new_confidence = row["confidence"]   # no change

    if new_confidence != row["confidence"]:
        conn.execute(
            "UPDATE events SET confidence = %s WHERE id = %s",
            (new_confidence, event_id),
        )
        log.info(
            "confidence_upgraded",
            event_id=str(event_id),
            old=row["confidence"],
            new=new_confidence,
        )
