-- =============================================================================
-- 0001_init.sql
-- Sentinel Review — initial schema
-- Target: PostgreSQL 15+ with PostGIS, pg_trgm, pgcrypto extensions
-- Run as superuser or a role with CREATE EXTENSION privilege on the database
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fast text search on descriptions
CREATE EXTENSION IF NOT EXISTS pg_cron;     -- scheduled refresh of materialized view

-- ---------------------------------------------------------------------------
-- sources
-- Manually curated list of OSINT accounts, feeds, and wires.
-- Never auto-populated; every new source must be reviewed by a human.
-- ---------------------------------------------------------------------------

CREATE TABLE sources (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    handle        TEXT        NOT NULL UNIQUE,
    platform      TEXT        NOT NULL CHECK (platform IN ('x', 'telegram', 'rss', 'wire')),
    display_name  TEXT        NOT NULL,
    url           TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    -- editorial trust level: affects confidence scoring weight
    trust_tier    SMALLINT    NOT NULL DEFAULT 2
                              CHECK (trust_tier BETWEEN 1 AND 3),
                              -- 1 = high (verified investigative accounts, wire services)
                              -- 2 = medium (established milblogs, regional press)
                              -- 3 = low (anonymous, state-affiliated, single-contributor)
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- raw_posts
-- Append-only log of every ingested post. Never mutated after insert.
-- ---------------------------------------------------------------------------

CREATE TABLE raw_posts (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     UUID        NOT NULL REFERENCES sources(id),
    external_id   TEXT        NOT NULL,
    posted_at     TIMESTAMPTZ NOT NULL,
    text          TEXT        NOT NULL,
    media_urls    TEXT[]      NOT NULL DEFAULT '{}',
    archive_url   TEXT,
    lang          TEXT,                         -- ISO 639-1 detected language
    ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- LLM processing state
    processed_at  TIMESTAMPTZ,
    skip_reason   TEXT,                         -- set if LLM decides this post has no event signal
    UNIQUE (source_id, external_id)
);

CREATE INDEX raw_posts_source_id_idx   ON raw_posts (source_id);
CREATE INDEX raw_posts_posted_at_idx   ON raw_posts (posted_at DESC);
CREATE INDEX raw_posts_processed_at_idx ON raw_posts (processed_at)
    WHERE processed_at IS NULL;               -- partial index: unprocessed posts only

-- ---------------------------------------------------------------------------
-- events
-- The presentation-layer object. Created by the LLM extraction pipeline
-- and optionally confirmed by a human reviewer.
-- ---------------------------------------------------------------------------

CREATE TABLE events (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type            TEXT        NOT NULL
                                      CHECK (event_type IN ('strike', 'clash', 'movement')),
    occurred_at           TIMESTAMPTZ NOT NULL,
    location              GEOMETRY(Point, 4326) NOT NULL,
    location_name         TEXT        NOT NULL,
    oblast                TEXT        NOT NULL,
    actor                 TEXT,                 -- attacking/moving force if known
    description           TEXT        NOT NULL,
    confidence            TEXT        NOT NULL
                                      CHECK (confidence IN ('verified', 'partial', 'unconfirmed'))
                                      DEFAULT 'unconfirmed',
    -- publishing state
    published_at          TIMESTAMPTZ,
    -- human review
    human_reviewed_at     TIMESTAMPTZ,
    human_reviewer_id     TEXT,                 -- reviewer username (basic auth, not a FK)
    human_reviewer_notes  TEXT,
    -- holds high-impact events for mandatory human review before publish
    held_for_review       BOOLEAN     NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index for bounding-box map queries
CREATE INDEX events_location_gist_idx  ON events USING GIST (location);
-- Time-range filtering (most queries)
CREATE INDEX events_occurred_at_idx    ON events (occurred_at DESC);
-- Confidence + type filters used in UI panels
CREATE INDEX events_confidence_idx     ON events (confidence);
CREATE INDEX events_event_type_idx     ON events (event_type);
-- Partial index: unpublished events for the admin queue
CREATE INDEX events_unpublished_idx    ON events (created_at DESC)
    WHERE published_at IS NULL;
-- Partial index: events awaiting human review
CREATE INDEX events_held_for_review_idx ON events (created_at DESC)
    WHERE held_for_review = true AND human_reviewed_at IS NULL;

-- ---------------------------------------------------------------------------
-- event_sources  (join table)
-- Links an event to the raw posts that support, corroborate, or contradict it.
-- ---------------------------------------------------------------------------

CREATE TABLE event_sources (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    source_id     UUID        NOT NULL REFERENCES sources(id),
    raw_post_id   UUID        REFERENCES raw_posts(id),
    relationship  TEXT        NOT NULL
                              CHECK (relationship IN ('primary', 'corroborating', 'contradicting')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, raw_post_id)     -- one link per post per event
);

CREATE INDEX event_sources_event_id_idx   ON event_sources (event_id);
CREATE INDEX event_sources_source_id_idx  ON event_sources (source_id);

-- ---------------------------------------------------------------------------
-- briefings
-- AI-generated daily briefings. Always marked AI DRAFT until published.
-- ---------------------------------------------------------------------------

CREATE TABLE briefings (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    theater        TEXT        NOT NULL DEFAULT 'ukraine',
    period_start   TIMESTAMPTZ NOT NULL,
    period_end     TIMESTAMPTZ NOT NULL,
    draft_text     TEXT        NOT NULL,
    published_text TEXT,
    status         TEXT        NOT NULL
                               CHECK (status IN ('draft', 'published'))
                               DEFAULT 'draft',
    -- the specific event IDs this briefing references (from LLM response)
    event_ids      UUID[]      NOT NULL DEFAULT '{}',
    -- prompt/response token counts for cost tracking
    prompt_tokens  INT,
    completion_tokens INT,
    published_by   TEXT,                        -- reviewer who clicked publish
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX briefings_status_idx    ON briefings (status);
CREATE INDEX briefings_theater_idx   ON briefings (theater, created_at DESC);

-- ---------------------------------------------------------------------------
-- jobs
-- Postgres-backed ingestion queue. Workers poll this table.
-- Replaces Redis/Celery for v0.1.
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type      TEXT        NOT NULL,
                              -- 'ingest_source' | 'extract_events' | 'generate_briefing'
    payload       JSONB       NOT NULL DEFAULT '{}',
    status        TEXT        NOT NULL
                              CHECK (status IN ('pending', 'running', 'done', 'failed'))
                              DEFAULT 'pending',
    attempts      SMALLINT    NOT NULL DEFAULT 0,
    max_attempts  SMALLINT    NOT NULL DEFAULT 3,
    scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workers select FOR UPDATE SKIP LOCKED on this index
CREATE INDEX jobs_pending_idx ON jobs (scheduled_at ASC)
    WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- llm_logs
-- Every prompt sent to the LLM and its response, for audit and retrospective.
-- Requirement from handoff: "Log every prompt/response."
-- ---------------------------------------------------------------------------

CREATE TABLE llm_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id           UUID        REFERENCES jobs(id),
    raw_post_id      UUID        REFERENCES raw_posts(id),
    briefing_id      UUID        REFERENCES briefings(id),
    purpose          TEXT        NOT NULL,
                                 -- 'entity_extraction' | 'deduplication' | 'briefing'
    model            TEXT        NOT NULL,
    prompt_tokens    INT,
    completion_tokens INT,
    prompt           TEXT        NOT NULL,
    response         TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX llm_logs_purpose_idx    ON llm_logs (purpose, created_at DESC);
CREATE INDEX llm_logs_briefing_idx   ON llm_logs (briefing_id) WHERE briefing_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- source_reliability  (materialized view)
-- Rolling 30-day verification rate per source. Refreshed hourly by pg_cron.
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW source_reliability AS
SELECT
    s.id                                            AS source_id,
    s.handle,
    s.display_name,
    s.platform,
    s.trust_tier,
    COUNT(DISTINCT es.event_id)
        FILTER (WHERE e.occurred_at > now() - INTERVAL '30 days')
                                                    AS events_30d,
    ROUND(
        COALESCE(
            AVG(
                CASE e.confidence
                    WHEN 'verified' THEN 1.0
                    WHEN 'partial'  THEN 0.5
                    ELSE 0.0
                END
            ) FILTER (WHERE e.occurred_at > now() - INTERVAL '30 days'),
            0
        ) * 100,
        1
    )                                               AS verified_rate_30d,
    MAX(e.occurred_at)                              AS last_event_at
FROM sources s
LEFT JOIN event_sources es ON es.source_id = s.id
LEFT JOIN events e         ON e.id = es.event_id
GROUP BY s.id, s.handle, s.display_name, s.platform, s.trust_tier
WITH DATA;

-- Required for REFRESH CONCURRENTLY (no downtime during refresh)
CREATE UNIQUE INDEX source_reliability_source_id_uidx
    ON source_reliability (source_id);

-- Hourly refresh via pg_cron (adjust schedule as needed)
SELECT cron.schedule(
    'refresh-source-reliability',
    '0 * * * *',
    'REFRESH MATERIALIZED VIEW CONCURRENTLY source_reliability'
);

-- ---------------------------------------------------------------------------
-- Helper function: confidence_score
-- Used in application code and future views to normalize confidence to 0–1.
-- ---------------------------------------------------------------------------

CREATE FUNCTION confidence_score(confidence TEXT)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE confidence
        WHEN 'verified' THEN 1.0
        WHEN 'partial'  THEN 0.5
        ELSE 0.0
    END
$$;

-- ---------------------------------------------------------------------------
-- Helper function: events_in_bbox
-- Returns events within a map bounding box and time range.
-- Used by the frontend API to drive map pins.
-- ---------------------------------------------------------------------------

CREATE FUNCTION events_in_bbox(
    min_lng  DOUBLE PRECISION,
    min_lat  DOUBLE PRECISION,
    max_lng  DOUBLE PRECISION,
    max_lat  DOUBLE PRECISION,
    from_ts  TIMESTAMPTZ DEFAULT now() - INTERVAL '24 hours',
    to_ts    TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    id            UUID,
    event_type    TEXT,
    occurred_at   TIMESTAMPTZ,
    lng           DOUBLE PRECISION,
    lat           DOUBLE PRECISION,
    location_name TEXT,
    oblast        TEXT,
    description   TEXT,
    confidence    TEXT,
    source_count  BIGINT
)
LANGUAGE sql STABLE AS $$
    SELECT
        e.id,
        e.event_type,
        e.occurred_at,
        ST_X(e.location)  AS lng,
        ST_Y(e.location)  AS lat,
        e.location_name,
        e.oblast,
        e.description,
        e.confidence,
        COUNT(DISTINCT es.source_id) AS source_count
    FROM events e
    LEFT JOIN event_sources es ON es.event_id = e.id
    WHERE e.location && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
      AND e.occurred_at BETWEEN from_ts AND to_ts
      AND e.published_at IS NOT NULL
    GROUP BY e.id
    ORDER BY e.occurred_at DESC;
$$;

COMMIT;
