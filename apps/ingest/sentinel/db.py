"""Database connection pool and common query helpers."""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Generator

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
            error = %s
        WHERE id = %s
        """,
        (error, job_id),
    )
    conn.commit()


def enqueue_job(
    conn: psycopg.Connection,
    *,
    job_type: str,
    payload: dict,
    scheduled_at: datetime | None = None,
    max_attempts: int = 3,
) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO jobs (job_type, payload, scheduled_at, max_attempts)
        VALUES (%s, %s, COALESCE(%s, now()), %s)
        RETURNING id
        """,
        (job_type, psycopg.types.json.Jsonb(payload), scheduled_at, max_attempts),
    ).fetchone()
    conn.commit()
    assert row is not None
    return row["id"]  # type: ignore[index]


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def get_all_sources(conn: psycopg.Connection) -> list[dict]:
    return conn.execute(
        """
        SELECT
            s.id, s.handle, s.display_name, s.platform, s.url,
            s.is_active, s.trust_tier, s.notes,
            COALESCE(sr.events_30d, 0) AS events_30d,
            COALESCE(sr.verified_rate_30d, 0) AS verified_rate_30d,
            sr.last_event_at
        FROM sources s
        LEFT JOIN source_reliability sr ON sr.source_id = s.id
        ORDER BY s.trust_tier, sr.events_30d DESC NULLS LAST
        """
    ).fetchall()  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Raw posts
# ---------------------------------------------------------------------------

def get_unprocessed_posts(
    conn: psycopg.Connection,
    *,
    source_id: uuid.UUID,
    batch_size: int = 10,
) -> list[dict]:
    return conn.execute(
        """
        SELECT id, source_id, external_id, posted_at, text, media_urls, lang
        FROM raw_posts
        WHERE source_id = %s
          AND processed_at IS NULL
          AND skip_reason IS NULL
        ORDER BY posted_at ASC
        LIMIT %s
        """,
        (source_id, batch_size),
    ).fetchall()  # type: ignore[return-value]


def mark_post_processed(
    conn: psycopg.Connection,
    post_id: uuid.UUID,
    *,
    skip_reason: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE raw_posts
        SET processed_at = now(), skip_reason = %s
        WHERE id = %s
        """,
        (skip_reason, post_id),
    )


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def insert_event(
    conn: psycopg.Connection,
    *,
    event_type: str,
    occurred_at: datetime,
    lat: float,
    lng: float,
    location_name: str,
    oblast: str,
    actor: str | None,
    description: str,
    confidence: str,
    held_for_review: bool = False,
) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO events (
            event_type, occurred_at, location, location_name, oblast,
            actor, description, confidence, held_for_review, published_at
        )
        VALUES (
            %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s,
            %s, %s, %s, %s,
            CASE WHEN %s THEN NULL ELSE now() END
        )
        RETURNING id
        """,
        (
            event_type, occurred_at, lng, lat, location_name, oblast,
            actor, description, confidence, held_for_review, held_for_review,
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
    relationship: str = "primary",
) -> None:
    conn.execute(
        """
        INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        (event_id, source_id, raw_post_id, relationship),
    )


def find_nearby_event(
    conn: psycopg.Connection,
    *,
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    hours: int = 6,
    event_type: str,
) -> dict | None:
    return conn.execute(
        """
        SELECT id, event_type, occurred_at, confidence,
               ST_Distance(
                   location::geography,
                   ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
               ) / 1000 AS distance_km
        FROM events
        WHERE occurred_at > now() - (%s * interval '1 hour')
          AND event_type = %s
          AND ST_DWithin(
              location::geography,
              ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
              %s * 1000
          )
        ORDER BY distance_km ASC
        LIMIT 1
        """,
        (lng, lat, hours, event_type, lng, lat, radius_km),
    ).fetchone()  # type: ignore[return-value]


def update_event_confidence(
    conn: psycopg.Connection,
    event_id: uuid.UUID,
    confidence: str,
    held_for_review: bool = False,
) -> None:
    conn.execute(
        """
        UPDATE events
        SET confidence = %s, held_for_review = %s
        WHERE id = %s
        """,
        (confidence, held_for_review, event_id),
    )


def get_recent_events(
    conn: psycopg.Connection,
    *,
    hours: int = 24,
    theater: str = "ukraine",
) -> list[dict]:
    """Events for the briefing generator — includes source count."""
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
          AND e.confidence IN ('verified', 'partial')
        GROUP BY e.id
        ORDER BY e.occurred_at DESC
        """,
        (hours,),
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
    briefing_id: uuid.UUID | None = None,
    raw_post_id: uuid.UUID | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO llm_logs (
            job_id, raw_post_id, briefing_id,
            purpose, model, prompt_tokens, completion_tokens, prompt, response
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            job_id, raw_post_id, briefing_id,
            purpose, model, prompt_tokens, completion_tokens, prompt, response,
        ),
    )
