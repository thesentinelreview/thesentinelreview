"""Database connection pool and common query helpers."""
from __future__ import annotations

import uuid
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import psycopg
import psycopg.rows
from psycopg_pool import ConnectionPool

from sentinel.config import settings

# ---------------------------------------------------------------------------
# Connection pool (created once at import time, reused across workers)
# ---------------------------------------------------------------------------

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=str(settings.database_url),
            min_size=1,
            max_size=5,
            kwargs={"row_factory": psycopg.rows.dict_row},
        )
    return _pool


@contextmanager
def get_conn() -> Generator[psycopg.Connection, None, None]:
    with get_pool().connection() as conn:
        yield conn


# ---------------------------------------------------------------------------
# Job queue
# ---------------------------------------------------------------------------

def claim_job(conn: psycopg.Connection) -> dict | None:
    """Atomically claim one pending job. Returns None if queue is empty."""
    row = conn.execute(
        """
        UPDATE jobs
        SET status = 'running',
            started_at = now(),
            attempts = attempts + 1
        WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'pending'
              AND scheduled_at <= now()
              AND attempts < max_attempts
            ORDER BY scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING *
        """,
    ).fetchone()
    conn.commit()
    return row  # type: ignore[return-value]


def complete_job(conn: psycopg.Connection, job_id: uuid.UUID) -> None:
    conn.execute(
        "UPDATE jobs SET status = 'done', completed_at = now() WHERE id = %s",
        (job_id,),
    )
    conn.commit()


def fail_job(conn: psycopg.Connection, job_id: uuid.UUID, error: str) -> None:
    conn.execute(
        """
        UPDATE jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
            error = %s,
            scheduled_at = now() + (attempts * interval '30 seconds')
        WHERE id = %s
        """,
        (error[:2000], job_id),
    )
    conn.commit()


def enqueue(
    conn: psycopg.Connection,
    job_type: str,
    payload: dict,
    scheduled_at: datetime | None = None,
) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO jobs (job_type, payload, scheduled_at)
        VALUES (%s, %s, COALESCE(%s, now()))
        RETURNING id
        """,
        (job_type, psycopg.types.json.Jsonb(payload), scheduled_at),
    ).fetchone()
    conn.commit()
    assert row is not None
    return row["id"]  # type: ignore[index]


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def get_active_sources(conn: psycopg.Connection) -> list[dict]:
    return conn.execute(
        "SELECT * FROM sources WHERE is_active = true ORDER BY trust_tier, handle",
    ).fetchall()  # type: ignore[return-value]


def get_source(conn: psycopg.Connection, source_id: uuid.UUID) -> dict | None:
    return conn.execute(
        "SELECT * FROM sources WHERE id = %s",
        (source_id,),
    ).fetchone()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Raw posts
# ---------------------------------------------------------------------------

def insert_raw_post(
    conn: psycopg.Connection,
    *,
    source_id: uuid.UUID,
    external_id: str,
    posted_at: datetime,
    text: str,
    media_urls: list[str] | None = None,
    archive_url: str | None = None,
    lang: str | None = None,
) -> uuid.UUID | None:
    """Insert a raw post. Returns the new id, or None if the post already exists."""
    row = conn.execute(
        """
        INSERT INTO raw_posts (
            source_id, external_id, posted_at, text, media_urls, archive_url, lang
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (source_id, external_id) DO NOTHING
        RETURNING id
        """,
        (source_id, external_id, posted_at, text, media_urls or [], archive_url, lang),
    ).fetchone()
    return row["id"] if row else None  # type: ignore[index]


def get_unprocessed_posts(
    conn: psycopg.Connection,
    source_id: uuid.UUID,
    limit: int = 50,
) -> list[dict]:
    return conn.execute(
        """
        SELECT * FROM raw_posts
        WHERE source_id = %s
          AND processed_at IS NULL
          AND skip_reason IS NULL
        ORDER BY posted_at DESC
        LIMIT %s
        """,
        (source_id, limit),
    ).fetchall()  # type: ignore[return-value]


def mark_post_processed(
    conn: psycopg.Connection,
    raw_post_id: uuid.UUID,
    skip_reason: str | None = None,
) -> None:
    conn.execute(
        "UPDATE raw_posts SET processed_at = now(), skip_reason = %s WHERE id = %s",
        (skip_reason, raw_post_id),
    )


def update_post_translation(
    conn: psycopg.Connection,
    raw_post_id: uuid.UUID,
    *,
    language: str | None,
    translated_text: str | None,
) -> None:
    """
    Persist a translation result. `language` overrides any prior `lang` value
    when non-null (the translator's detection is more authoritative than the
    ingest-time guess).
    """
    if language is not None:
        conn.execute(
            "UPDATE raw_posts SET translated_text = %s, lang = %s WHERE id = %s",
            (translated_text, language, raw_post_id),
        )
    else:
        conn.execute(
            "UPDATE raw_posts SET translated_text = %s WHERE id = %s",
            (translated_text, raw_post_id),
        )


def get_posts_by_ids(
    conn: psycopg.Connection,
    ids: list[uuid.UUID],
) -> list[dict]:
    return conn.execute(
        "SELECT * FROM raw_posts WHERE id = ANY(%s)",
        (ids,),
    ).fetchall()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def insert_event(
    conn: psycopg.Connection,
    *,
    event_type: str,
    occurred_at: datetime,
    lng: float,
    lat: float,
    location_name: str,
    oblast: str,
    actor: str | None,
    description: str,
    confidence: str,
    held_for_review: bool = False,
    relevance_score: int | None = None,
    weapon_type: str | None = None,
) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO events (
            event_type, occurred_at, location,
            location_name, oblast, actor, description,
            confidence, held_for_review, published_at, relevance_score,
            weapon_type
        )
        VALUES (
            %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
            %s, %s, %s, %s,
            %s, %s, CASE WHEN %s THEN NULL ELSE now() END, %s,
            %s
        )
        RETURNING id
        """,
        (
            event_type, occurred_at, lng, lat,
            location_name, oblast, actor, description,
            confidence, held_for_review, held_for_review, relevance_score,
            weapon_type,
        ),
    ).fetchone()
    assert row is not None
    return row["id"]  # type: ignore[index]


def link_event_source(
    conn: psycopg.Connection,
    *,
    event_id: uuid.UUID,
    source_id: uuid.UUID,
    raw_post_id: uuid.UUID,
    relationship: str,
) -> None:
    conn.execute(
        """
        INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (event_id, raw_post_id) DO NOTHING
        """,
        (event_id, source_id, raw_post_id, relationship),
    )


def update_event_weapon_type(
    conn: psycopg.Connection,
    event_id: uuid.UUID,
    *,
    weapon_type: str | None,
) -> None:
    """Persist a (back)filled weapon_type onto an existing event row."""
    conn.execute(
        "UPDATE events SET weapon_type = %s WHERE id = %s",
        (weapon_type, event_id),
    )


_THEATER_BBOX: dict[str, tuple[float, float, float, float]] = {
    "ukraine": (22, 44, 40, 52),
    # iran spans the proxy theater (Lebanon→Yemen), matching the web dashboard
    # and the extraction prompt scope — not just Iran proper.
    "iran":    (32, 10, 64, 42),
    "sudan":   (21,  8, 42, 23),
    "myanmar": (92,  9, 102, 29),
}


def get_recent_events(
    conn: psycopg.Connection,
    *,
    hours: int = 24,
    theater: str = "ukraine",
    confidence: tuple[str, ...] = ("verified", "partial"),
) -> list[dict]:
    """Events for the briefing generator — includes source count.

    `confidence` selects which confidence levels to include; the briefing
    generator widens it through a cascade when the strict set is empty.
    """
    bbox = _THEATER_BBOX.get(theater, _THEATER_BBOX["ukraine"])
    min_lng, min_lat, max_lng, max_lat = bbox
    return conn.execute(
        """
        SELECT
            e.id, e.event_type, e.occurred_at,
            ST_X(e.location) AS lng, ST_Y(e.location) AS lat,
            e.location_name, e.oblast, e.description, e.confidence,
            COUNT(DISTINCT es.source_id) AS source_count
        FROM events e
        LEFT JOIN event_sources es ON es.event_id = e.id
        WHERE e.occurred_at > now() - (%s * interval '1 hour')
          AND e.confidence = ANY(%s)
          AND ST_Within(e.location, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
        GROUP BY e.id
        ORDER BY e.occurred_at DESC
        """,
        (hours, list(confidence), min_lng, min_lat, max_lng, max_lat),
    ).fetchall()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Briefings
# ---------------------------------------------------------------------------

def insert_briefing(
    conn: psycopg.Connection,
    *,
    theater: str,
    period_start: datetime,
    period_end: datetime,
    draft_text: str,
    event_ids: list[uuid.UUID],
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO briefings (
            theater, period_start, period_end,
            draft_text, published_text, status, published_at,
            event_ids, prompt_tokens, completion_tokens
        )
        VALUES (%s, %s, %s, %s, %s, 'published', now(), %s, %s, %s)
        RETURNING id
        """,
        (
            theater, period_start, period_end,
            draft_text, draft_text, event_ids, prompt_tokens, completion_tokens,
        ),
    ).fetchone()
    assert row is not None
    return row["id"]  # type: ignore[index]


# ---------------------------------------------------------------------------
# LLM logs
# ---------------------------------------------------------------------------

def log_llm_call(
    conn: psycopg.Connection,
    *,
    purpose: str,
    model: str,
    prompt: str,
    response: str,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    job_id: uuid.UUID | None = None,
    raw_post_id: uuid.UUID | None = None,
    briefing_id: uuid.UUID | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO llm_logs (
            job_id, raw_post_id, briefing_id,
            purpose, model, prompt_tokens, completion_tokens,
            prompt, response
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            job_id, raw_post_id, briefing_id,
            purpose, model, prompt_tokens, completion_tokens,
            prompt, response,
        ),
    )


# ---------------------------------------------------------------------------
# Candidate event deduplication helper
# ---------------------------------------------------------------------------

def find_nearby_events(
    conn: psycopg.Connection,
    *,
    lng: float,
    lat: float,
    radius_km: float = 5.0,
    within_hours: float = 6.0,
    event_type: str,
) -> list[dict[str, Any]]:
    """Return existing events within radius_km and within_hours of the candidate."""
    return conn.execute(
        """
        SELECT
            e.id, e.event_type, e.occurred_at, e.description,
            e.confidence, e.location_name,
            ST_Distance(e.location::geography, ST_MakePoint(%s,%s)::geography) / 1000 AS dist_km,
            COUNT(DISTINCT es.source_id) AS source_count
        FROM events e
        LEFT JOIN event_sources es ON es.event_id = e.id
        WHERE e.event_type = %s
          AND ST_DWithin(
              e.location::geography,
              ST_MakePoint(%s, %s)::geography,
              %s * 1000
          )
          AND e.occurred_at > now() - (%s * interval '1 hour')
        GROUP BY e.id
        ORDER BY dist_km ASC, e.occurred_at DESC
        """,
        (lng, lat, event_type, lng, lat, radius_km, within_hours),
    ).fetchall()  # type: ignore[return-value]
