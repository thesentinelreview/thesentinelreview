"""
ingest_source job
-----------------
Fetches new posts from a single source and inserts them into raw_posts.
Creates extract_events jobs for every batch of new posts.

Payload schema: IngestSourcePayload
"""
from __future__ import annotations

import uuid
from collections import deque
from collections.abc import Callable

import psycopg
import structlog

from sentinel.config import settings
from sentinel.db import enqueue, get_source, insert_raw_post, record_source_fetch
from sentinel.models import IngestSourcePayload

log = structlog.get_logger()

# Postgres SQLSTATEs worth one retry: serialization failure / deadlock. Both are
# transient under concurrency and usually succeed on a fresh transaction.
_RETRYABLE_SQLSTATES = {"40001", "40P01"}

# Persistently-failed health stamps, surfaced in the one-shot run summary
# (runner.run_ingest drains this). Bounded so the long-running worker — which
# logs each failure as a warning and never drains — can't grow it without limit.
_STAMP_FAILURES: deque[tuple[str, str]] = deque(maxlen=1000)


def _is_serialization_error(exc: BaseException) -> bool:
    """True for a Postgres serialization-failure / deadlock error (by SQLSTATE),
    the only stamp failures worth retrying."""
    return getattr(exc, "sqlstate", None) in _RETRYABLE_SQLSTATES


def _run_with_serialization_retry(
    attempt: Callable[[], None],
    *,
    is_retryable: Callable[[BaseException], bool] = _is_serialization_error,
    retries: int = 1,
) -> str | None:
    """Run ``attempt``; on a retryable error, retry up to ``retries`` times.

    Returns None on success, or a "Type: message" string on persistent or
    non-retryable failure. ``attempt`` must be self-contained (roll back its own
    transaction on failure) since it may be called more than once. Pure control
    flow — no DB — so the retry decision is unit-testable without Postgres.
    """
    last_error = ""
    for i in range(retries + 1):
        try:
            attempt()
            return None
        except Exception as exc:  # noqa: BLE001 — classified, then surfaced not swallowed
            last_error = f"{type(exc).__name__}: {exc}"
            if i < retries and is_retryable(exc):
                continue
            return last_error
    return last_error


def record_stamp_failure(handle: str, error: str) -> None:
    _STAMP_FAILURES.append((handle, error))


def drain_stamp_failures() -> list[tuple[str, str]]:
    """Return and clear the recorded stamp failures (read by the run summary)."""
    failures = list(_STAMP_FAILURES)
    _STAMP_FAILURES.clear()
    return failures


def run(conn: psycopg.Connection, *, job_id: uuid.UUID, payload: dict) -> None:
    params = IngestSourcePayload.model_validate(payload)
    source = get_source(conn, params.source_id)
    if source is None:
        raise ValueError(f"Source not found: {params.source_id}")

    platform = source["platform"]
    log.info("ingesting_source", source=source["handle"], platform=platform)

    new_ids = _ingest(conn, source=source, since_hours=params.since_hours)

    log.info("ingested_posts", source=source["handle"], new_count=len(new_ids))

    # Enqueue extraction jobs in batches
    batch_size = settings.worker_batch_size
    for i in range(0, len(new_ids), batch_size):
        batch = new_ids[i : i + batch_size]
        enqueue(
            conn,
            "extract_events",
            {"raw_post_ids": [str(x) for x in batch], "source_id": str(params.source_id)},
        )
        log.debug("enqueued_extract_batch", batch_size=len(batch))


def _ingest(
    conn: psycopg.Connection,
    *,
    source: dict,
    since_hours: int,
) -> list[uuid.UUID]:
    platform = source["platform"]

    if platform == "rss":
        from sentinel.ingestors.rss import RSSIngestor
        ingestor = RSSIngestor(source)
    elif platform == "telegram":
        from sentinel.ingestors.telegram import TelegramIngestor
        ingestor = TelegramIngestor(source)
    elif platform == "x":
        from sentinel.ingestors.x import XIngestor
        ingestor = XIngestor(source)
    elif platform == "bluesky":
        from sentinel.ingestors.bluesky import BlueskyIngestor
        ingestor = BlueskyIngestor(source)
    elif platform == "gdelt":
        if source["handle"].startswith("gdelt_gkg"):
            from sentinel.ingestors.gdelt import GdeltGkgIngestor
            ingestor = GdeltGkgIngestor(source)
        else:
            from sentinel.ingestors.gdelt import GdeltEventsIngestor
            ingestor = GdeltEventsIngestor(source)
    else:
        raise ValueError(f"Unknown platform: {platform!r}")

    try:
        posts = ingestor.fetch(since_hours=since_hours)
    except Exception as exc:
        # Hard fetch failure (missing dep, platform client error, …): stamp the
        # source so it isn't a silent 0, then re-raise so the job is still marked
        # failed and the error lands in jobs.error.
        _stamp(conn, source, posts_inserted=0, meta={"transport_error": f"{type(exc).__name__}: {exc}"})
        raise

    new_ids: list[uuid.UUID] = []
    for post in posts:
        inserted_id = insert_raw_post(
            conn,
            source_id=source["id"],
            external_id=post["external_id"],
            posted_at=post["posted_at"],
            text=post["text"],
            media_urls=post.get("media_urls", []),
            archive_url=post.get("archive_url"),
            lang=post.get("lang"),
        )
        if inserted_id:
            new_ids.append(inserted_id)

    # Commit inserts first, then stamp health separately — a stamp failure must
    # never roll back ingested posts.
    conn.commit()
    _stamp(conn, source, posts_inserted=len(new_ids), meta=getattr(ingestor, "last_fetch_meta", None))
    return new_ids


def _stamp(conn: psycopg.Connection, source: dict, *, posts_inserted: int, meta: dict | None) -> None:
    """Per-source health stamp; isolated so it never breaks ingest (posts are
    already committed by the caller). Retries once on a serialization/deadlock
    error, and on persistent failure records the error so the run summary can
    surface it instead of silently swallowing a stale-health source."""
    handle = source.get("handle") or str(source.get("id"))

    def _attempt() -> None:
        try:
            record_source_fetch(conn, source["id"], posts_inserted=posts_inserted, meta=meta)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    error = _run_with_serialization_retry(_attempt)
    if error is not None:
        log.warning("source_health_stamp_failed", source=handle, error=error)
        record_stamp_failure(handle, error)
