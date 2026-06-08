"""
extract_events job
------------------
Takes a batch of raw_posts, runs LLM entity extraction on each, deduplicates
against existing events, scores confidence, and writes to the events table.

Payload schema: ExtractEventsPayload
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import psycopg
import structlog

from sentinel.config import settings
from sentinel.db import (
    get_posts_by_ids,
    get_source,
    insert_event,
    link_event_source,
    log_llm_call,
    mark_post_processed,
    record_dedup_decision,
    update_post_translation,
)
from sentinel.models import ExtractEventsPayload
from sentinel.pipeline.dedup import RADIUS_KM, find_duplicate
from sentinel.pipeline.extractor import extract_event
from sentinel.pipeline.geocode_precision import derive_precision
from sentinel.pipeline.scorer import classify, has_strong_signal, score_confidence
from sentinel.pipeline.theater_router import classify_theater
from sentinel.pipeline.translator import translate_post

log = structlog.get_logger()

# Tolerance for occurred_at slightly exceeding posted_at — covers clock skew
# and timezone rounding so legitimately-recent events aren't perturbed.
_FUTURE_OCCURRED_AT_TOLERANCE = timedelta(hours=1)


def _clamp_future_occurred_at(
    occurred_at: datetime | None,
    *,
    posted_at: datetime | None,
    post_id: uuid.UUID,
) -> datetime | None:
    """Clamp an LLM-extracted occurred_at to posted_at when it lands more than
    `_FUTURE_OCCURRED_AT_TOLERANCE` after the reporting post. An event cannot
    have occurred meaningfully after the post that reports it; this is the
    write-time backstop for checks.check_future_occurred_at, guarding against
    the LLM lifting a garbled future date verbatim from hostile source text.

    Returns occurred_at unchanged when it is None, when posted_at is None, or
    when it is at or before posted_at + tolerance.
    """
    if occurred_at is None or posted_at is None:
        return occurred_at
    if occurred_at <= posted_at + _FUTURE_OCCURRED_AT_TOLERANCE:
        return occurred_at
    log.warning(
        "future_occurred_at_clamped",
        post_id=str(post_id),
        extracted_occurred_at=occurred_at.isoformat(),
        clamped_to=posted_at.isoformat(),
    )
    return posted_at


def _is_occurred_at_too_old(
    occurred_at: datetime | None,
    *,
    posted_at: datetime | None,
    floor_days: int,
) -> bool:
    """Past-side mirror of _clamp_future_occurred_at: True ⇒ skip the event.

    The LLM occasionally lifts a commemorative/historical reference verbatim
    ("one year ago today…") and emits an event whose occurred_at is far older
    than the post reporting it. Skip such events outright — they're almost
    always hallucinations, and the rare legitimate delayed-analysis case is
    a better fit for a future held-for-review path than for silent insert.

    Boundary (occurred_at exactly at posted_at - floor_days) is inclusive — kept.
    Returns False when either timestamp is None.
    """
    if occurred_at is None or posted_at is None:
        return False
    return occurred_at < posted_at - timedelta(days=floor_days)


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

    # ── Theater routing ──────────────────────────────────────────────────────
    # Route by CONTENT (source.theaters is only a prior) so a multi-theater
    # source's off-primary content — e.g. an ISW post about Iran — is judged
    # under the right theater instead of the source's first theater.
    theater, classify_meta = classify_theater(text_for_extraction, source=source)
    log_llm_call(
        conn,
        purpose="theater_classify",
        model=classify_meta["model"],
        prompt=classify_meta["prompt"],
        response=classify_meta["response"],
        prompt_tokens=classify_meta.get("prompt_tokens"),
        completion_tokens=classify_meta.get("completion_tokens"),
        job_id=job_id,
        raw_post_id=post_id,
    )
    if theater is None:
        # Confidently off all four theaters — short-circuit before the expensive
        # Sonnet extract. The router is biased to inclusion, so this fires only on
        # clearly off-topic posts that would skip anyway.
        mark_post_processed(conn, post_id, skip_reason="off_theater")
        log.debug("post_off_theater", post_id=str(post_id))
        return

    # ── LLM extraction ───────────────────────────────────────────────────────
    result, llm_meta = extract_event(
        text_for_extraction,
        source=source,
        theater=theater,
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

    occurred_at = _clamp_future_occurred_at(
        result.occurred_at,
        posted_at=post.get("posted_at"),
        post_id=post_id,
    )

    if _is_occurred_at_too_old(
        occurred_at,
        posted_at=post.get("posted_at"),
        floor_days=settings.occurred_at_past_floor_days,
    ):
        mark_post_processed(conn, post_id, skip_reason="occurred_at_past_floor")
        log.warning(
            "past_occurred_at_skipped",
            post_id=str(post_id),
            occurred_at=occurred_at.isoformat(),  # type: ignore[union-attr]
            posted_at=post["posted_at"].isoformat(),
            floor_days=settings.occurred_at_past_floor_days,
        )
        return

    # ── Deduplication ────────────────────────────────────────────────────────
    # Deterministic precision tag (from coordinate structure, not the model). A
    # coarse tag means a region/country centroid, which can't be spatially deduped.
    incoming_precision = derive_precision(
        result.lng, result.lat, result.location_name,  # type: ignore[arg-type]
    )
    duplicate = find_duplicate(
        conn,
        lng=result.lng,         # type: ignore[arg-type]
        lat=result.lat,         # type: ignore[arg-type]
        occurred_at=occurred_at,  # type: ignore[arg-type]
        event_type=result.event_type,  # type: ignore[arg-type]
        incoming_precision=incoming_precision,
    )
    incoming_signal = has_strong_signal(result.geolocation_signals)

    if duplicate is not None:
        # Corroborate the existing event rather than creating a new one
        duplicate_id = duplicate["id"]
        log.info("event_corroborated", existing_id=str(duplicate_id), post_id=str(post_id))
        link_event_source(
            conn,
            event_id=duplicate_id,
            source_id=source["id"],
            raw_post_id=post_id,
            relationship="corroborating",
        )
        # Re-score now that another source has attached: OR in this post's strong
        # signal, then recompute deterministically from the event's current sources.
        _maybe_upgrade_confidence(
            conn, event_id=duplicate_id, incoming_strong_signal=incoming_signal
        )
        _record_dedup_decision_safe(
            conn,
            decision="merge",
            event_id=duplicate_id,
            occurred_at=occurred_at,  # type: ignore[arg-type]
            incoming_precision=incoming_precision,
            matched=duplicate,
        )
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
        occurred_at=occurred_at,        # type: ignore[arg-type]
        lng=result.lng,                 # type: ignore[arg-type]
        lat=result.lat,                 # type: ignore[arg-type]
        location_name=result.location_name,
        oblast=result.oblast,
        actor=result.actor,
        description=result.description,
        confidence=assessment.confidence,
        has_strong_signal=assessment.has_strong_signal,
        geocode_precision=incoming_precision,
        held_for_review=assessment.held_for_review,
        relevance_score=result.relevance_score,
        weapon_type=result.weapon_type,
    )

    link_event_source(
        conn,
        event_id=event_id,
        source_id=source["id"],
        raw_post_id=post_id,
        relationship="primary",
    )

    _record_dedup_decision_safe(
        conn,
        decision="new",
        event_id=event_id,
        occurred_at=occurred_at,  # type: ignore[arg-type]
        incoming_precision=incoming_precision,
        matched=None,
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


def _maybe_upgrade_confidence(
    conn: psycopg.Connection,
    *,
    event_id: uuid.UUID,
    incoming_strong_signal: bool,
) -> None:
    """Re-score an event's confidence now that another source has corroborated it.

    Persists the corroborating post's strong signal onto the event (OR-in), then
    recomputes confidence deterministically from the event's CURRENT sources and
    its persisted `has_strong_signal` — the same `classify` rule score_confidence
    uses, so `verified` means the same thing on both paths.

    Because corroboration only adds sources and the strong-signal flag only flips
    false→true, `classify` is monotonic over these inputs: this path can promote
    (e.g. an event whose first source lacked a signal reaches `verified` once a
    cross-platform source carrying one attaches) but never demote.
    """
    if incoming_strong_signal:
        conn.execute(
            "UPDATE events SET has_strong_signal = true WHERE id = %s AND NOT has_strong_signal",
            (event_id,),
        )

    row = conn.execute(
        """
        SELECT
            e.confidence,
            e.has_strong_signal,
            COUNT(DISTINCT es.source_id) AS source_count,
            COUNT(DISTINCT s.platform)   AS platform_count,
            MIN(s.trust_tier)            AS min_trust_tier
        FROM events e
        JOIN event_sources es ON es.event_id = e.id
        JOIN sources s        ON s.id = es.source_id
        WHERE e.id = %s
        GROUP BY e.id, e.confidence, e.has_strong_signal
        """,
        (event_id,),
    ).fetchone()

    if row is None:
        return

    new_confidence = classify(
        source_count=row["source_count"],
        platform_count=row["platform_count"],
        min_trust_tier=row["min_trust_tier"],
        strong_signal=row["has_strong_signal"],
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


def _record_dedup_decision_safe(
    conn: psycopg.Connection,
    *,
    decision: str,
    event_id: uuid.UUID,
    occurred_at: datetime,
    incoming_precision: str,
    matched: dict | None,
) -> None:
    """Record the matcher's decision to the dedup_decisions audit trail; best-effort.

    Wrapped in a SAVEPOINT (nested transaction) so a failure here rolls back only
    this insert and never aborts the surrounding extract transaction —
    instrumentation must not break ingest.
    """
    matched_event_id: uuid.UUID | None = None
    matched_occurred_at: datetime | None = None
    gap_hours: float | None = None
    distance_m: float | None = None
    matched_precision: str | None = None
    if matched is not None:
        matched_event_id = matched["id"]
        matched_occurred_at = matched["occurred_at"]
        gap_hours = abs((matched_occurred_at - occurred_at).total_seconds()) / 3600
        distance_m = matched["dist_km"] * 1000
        matched_precision = matched["geocode_precision"]

    try:
        with conn.transaction():
            record_dedup_decision(
                conn,
                event_id=event_id,
                matched_event_id=matched_event_id,
                incoming_occurred_at=occurred_at,
                matched_occurred_at=matched_occurred_at,
                gap_hours=gap_hours,
                distance_m=distance_m,
                window_hours=settings.dedup_max_time_gap_hours,
                radius_km=RADIUS_KM,
                decision=decision,
                incoming_precision=incoming_precision,
                matched_precision=matched_precision,
            )
    except Exception as exc:
        log.warning("dedup_decision_record_failed", event_id=str(event_id), error=str(exc))
