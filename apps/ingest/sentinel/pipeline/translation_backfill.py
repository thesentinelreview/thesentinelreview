"""
One-shot backfill: translate historical raw_posts that the live ingest never
touched because they predate the translator.

Idempotent — re-running picks up where the last run left off because
successful translations are persisted to raw_posts.translated_text and the
query filters on `translated_text IS NULL`.

Configured via env vars:
  SENTINEL_BACKFILL_DAYS         (default 30)    — only consider posts ingested in this window
  SENTINEL_BACKFILL_RATE_LIMIT   (default 5.0)   — max translate_post calls per second
  SENTINEL_BACKFILL_BATCH_SIZE   (default 100)   — rows fetched per DB roundtrip
  SENTINEL_BACKFILL_MAX_POSTS    (default 0)     — safety cap; 0 means no cap

Designed to run from GitHub Actions via the sentinel-backfill-translations
workflow, but importable for local invocation or unit tests.
"""
from __future__ import annotations

import os
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import psycopg
import structlog

from sentinel.db import get_conn, log_llm_call, update_post_translation
from sentinel.pipeline.translator import translate_post

log = structlog.get_logger()


@dataclass
class BackfillStats:
    """Summary of one backfill run. Useful for tests and operator review."""
    considered:  int = 0   # rows pulled from the DB
    translated:  int = 0   # successful API translations
    skipped:     int = 0   # pre-filter skipped (English / link-only / empty)
    failed:      int = 0   # API was called but parse / response yielded NULL


def _config() -> dict:
    return {
        "days":       int(os.environ.get("SENTINEL_BACKFILL_DAYS", "30")),
        "rate_rps":   float(os.environ.get("SENTINEL_BACKFILL_RATE_LIMIT", "5.0")),
        "batch_size": int(os.environ.get("SENTINEL_BACKFILL_BATCH_SIZE", "100")),
        "max_posts":  int(os.environ.get("SENTINEL_BACKFILL_MAX_POSTS", "0")),
    }


def _fetch_batch(
    conn: psycopg.Connection,
    *,
    days: int,
    batch_size: int,
    after_id: uuid.UUID | None,
) -> list[dict]:
    """
    Pull a batch of untranslated raw_posts. We exclude known-English rows so
    we don't burn DB roundtrips on posts the pre-filter would skip anyway,
    but we still hit pre-filter for lang IS NULL — many sources don't set
    a language tag.

    Keyset-paginated by id so a long-running backfill processes each row
    exactly once even if other writers update the table mid-run.
    """
    if after_id is None:
        rows = conn.execute(
            """
            SELECT id, text, source_id
            FROM raw_posts
            WHERE translated_text IS NULL
              AND (lang IS NULL OR lang <> 'en')
              AND ingested_at > now() - (%s * INTERVAL '1 day')
            ORDER BY id ASC
            LIMIT %s
            """,
            (days, batch_size),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, text, source_id
            FROM raw_posts
            WHERE translated_text IS NULL
              AND (lang IS NULL OR lang <> 'en')
              AND ingested_at > now() - (%s * INTERVAL '1 day')
              AND id > %s
            ORDER BY id ASC
            LIMIT %s
            """,
            (days, after_id, batch_size),
        ).fetchall()
    return rows  # type: ignore[return-value]


def _iter_posts(
    conn: psycopg.Connection,
    *,
    days: int,
    batch_size: int,
    max_posts: int,
) -> Iterator[dict]:
    after_id: uuid.UUID | None = None
    yielded = 0
    while True:
        rows = _fetch_batch(conn, days=days, batch_size=batch_size, after_id=after_id)
        if not rows:
            return
        for row in rows:
            yield row
            yielded += 1
            if max_posts and yielded >= max_posts:
                return
        after_id = rows[-1]["id"]


def _get_source(conn: psycopg.Connection, source_id: uuid.UUID) -> dict | None:
    return conn.execute(
        "SELECT id, handle, platform, display_name, trust_tier FROM sources WHERE id = %s",
        (source_id,),
    ).fetchone()  # type: ignore[return-value]


def _process_one(
    conn: psycopg.Connection,
    *,
    post: dict,
    source: dict,
    stats: BackfillStats,
) -> None:
    """Translate one post and persist the result. Never raises."""
    try:
        result, llm_meta = translate_post(post["text"], source=source)
    except Exception:
        log.exception("backfill_translate_failed", post_id=str(post["id"]))
        stats.failed += 1
        return

    if llm_meta is not None:
        log_llm_call(
            conn,
            purpose="translate_raw_post",
            model=llm_meta["model"],
            prompt=llm_meta["prompt"],
            response=llm_meta["response"],
            prompt_tokens=llm_meta.get("prompt_tokens"),
            completion_tokens=llm_meta.get("completion_tokens"),
            job_id=None,
            raw_post_id=post["id"],
        )
        if result.translation is not None:
            stats.translated += 1
        else:
            stats.failed += 1
    else:
        stats.skipped += 1

    update_post_translation(
        conn,
        post["id"],
        language=result.language,
        translated_text=result.translation,
    )
    conn.commit()


def run_backfill(conn: psycopg.Connection | None = None) -> BackfillStats:
    """
    Execute the backfill. If `conn` is None, opens its own connection.

    Returns BackfillStats so callers (the GitHub Actions wrapper, tests) can
    log the final tally.
    """
    cfg = _config()
    log.info("backfill_start", **cfg)

    stats = BackfillStats()
    source_cache: dict[uuid.UUID, dict] = {}
    next_call_at = time.monotonic()
    interval = 1.0 / cfg["rate_rps"] if cfg["rate_rps"] > 0 else 0.0

    own_conn = conn is None
    if own_conn:
        conn_ctx = get_conn()
        conn = conn_ctx.__enter__()
    try:
        for post in _iter_posts(
            conn,
            days=cfg["days"],
            batch_size=cfg["batch_size"],
            max_posts=cfg["max_posts"],
        ):
            stats.considered += 1

            source = source_cache.get(post["source_id"])
            if source is None:
                source = _get_source(conn, post["source_id"])
                if source is None:
                    log.warning("backfill_source_missing", post_id=str(post["id"]))
                    stats.failed += 1
                    continue
                source_cache[post["source_id"]] = source

            # Rate-limit on every iteration. Pre-filter skips still tick the
            # clock — cheap, and protects us if the prefilter heuristic
            # changes to require an API call in the future.
            now = time.monotonic()
            if now < next_call_at:
                time.sleep(next_call_at - now)
            next_call_at = time.monotonic() + interval

            _process_one(conn, post=post, source=source, stats=stats)

            if stats.considered % 100 == 0:
                log.info(
                    "backfill_progress",
                    considered=stats.considered,
                    translated=stats.translated,
                    skipped=stats.skipped,
                    failed=stats.failed,
                )
    finally:
        if own_conn:
            conn_ctx.__exit__(None, None, None)  # type: ignore[union-attr]

    log.info(
        "backfill_complete",
        considered=stats.considered,
        translated=stats.translated,
        skipped=stats.skipped,
        failed=stats.failed,
    )
    return stats
