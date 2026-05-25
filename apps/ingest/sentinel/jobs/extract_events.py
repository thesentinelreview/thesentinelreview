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
    update_post_translation,
)
from sentinel.models import ExtractEventsPayload
from sentinel.pipeline.dedup import find_duplicate
from sentinel.pipeline.extractor import extract_event
from sentinel.pipeline.scorer import classify, score_confidence
from sentinel.pipeline.translator import translate_post

log = structlog.get_logger()


def run(conn: psycopg.Connection, *, job_id: uuid.UUID, payload: dict) -> None:
    params = ExtractEventsPayload.model_validate(payload)
    posts = get_posts_by_ids(conn, params.raw_post_ids)
    source = get_source(conn, params.source_id)
    if source is None:
        raise ValueError(f"Source not found: {params.source_id}")

    log.info("extracting_events", post_count=len(posts), source=source["handle"])

    for post in posts:
        _process_post(conn, post=post, source=source, job_id=job_id)

    conn.commit()


def _process_post(
    conn: psycopg.Connection,
    *,
    post: dict,
    source: dict,
    job_id: uuid.UUID,
) -> None:
    post_id: uuid.UUID = post["id"]

    # ── Translation ──────────────────────────────────────────────────────────
    # Run before extraction so the extractor sees English text. Skipped posts
    # (English by heuristic, link-only, empty) consume no API budget.
    translation, translate_meta = translate_post(post["text"], source=source)

    if translate_meta is not None:
        log_llm_call(
            conn,
            purpose="translate_raw_post",
            model=translate_meta["model"],
            prompt=translate_meta["prompt"],
            response=translate_meta["response"],
            prompt_tokens=translate_meta.get("prompt_tokens"),
            completion_tokens=translate_meta.get("completion_tokens"),
            job_id=job_id,
            raw_post_id=post_id,
        )

    update_post_translation(
        conn,
        post_id,
        language=translation.language,
        translated_text=translation.translation,
    )

    # Use the English translation for extraction when available; fall back to
    # the original text when translation was skipped (English source) or failed.
    text_for_extraction = translation.translation or post["text"]

    # ── LLM extraction ───────────────────────────────────────────────────────
    result, llm_meta = extract_event(
        text_for_extraction,
        source=source,
        theater=(source.get("theaters") or ["ukraine"])[0],
        post_timestamp=post.get("posted_at"),
    )

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

    # All required fields must be present. Use `is None` so that a legitimate
    # 0.0 latitude/longitude (equator/prime meridian) is not treated as missing.
    required = [
        result.event_type, result.occurred_at, result.lat, result.lng,
        result.location_name, result.oblast, result.description,
    ]
    if any(v is None for v in required):
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
        relevance_score=result.relevance_score,
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
    """Re-score an event's confidence now that it has an additional corroborating source.

    Uses the same `classify` rule as initial scoring so `verified` requires a
    strong signal on both paths — previously this path promoted to `verified`
    on source/platform counts alone, disagreeing with score_confidence.

    The strong signal isn't persisted on the event, so recover it from the
    current confidence: per the scorer's rules the only way a single-source
    event leaves `unconfirmed` is a strong geo signal, so a non-`unconfirmed`
    event is known to carry one. This is conservative — it never grants
    `verified` without prior evidence of a strong signal.
    """
    row = conn.execute(
        """
        SELECT
            e.confidence,
            COUNT(DISTINCT es.source_id) AS source_count,
            COUNT(DISTINCT s.platform)   AS platform_count,
            MIN(s.trust_tier)            AS min_trust_tier
        FROM events e
        JOIN event_sources es ON es.event_id = e.id
        JOIN sources s        ON s.id = es.source_id
        WHERE e.id = %s
        GROUP BY e.id, e.confidence
        """,
        (event_id,),
    ).fetchone()

    if row is None:
        return

    new_confidence = classify(
        source_count=row["source_count"],
        platform_count=row["platform_count"],
        min_trust_tier=row["min_trust_tier"],
        strong_signal=row["confidence"] != "unconfirmed",
    )

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
