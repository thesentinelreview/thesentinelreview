-- =============================================================================
-- 0024_add_dedup_decisions.sql
--
-- Append-only audit trail of every matcher outcome, so over-merges are auditable.
-- When the deduper corroborates an incoming report into an existing event
-- ('merge'), the incoming report's independently-extracted occurred_at is
-- discarded — the event keeps the primary's. That makes an over-merge (a wide
-- time gap fusing two distinct incidents at the same place + type) invisible from
-- the events table afterward. This table captures both occurred_at timestamps and
-- the gap at the merge site, where they are both still in hand.
--
-- No FK to events: this is an audit log that must survive a later event deletion.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because migrate.py applies each file
-- inside one transaction, where CONCURRENTLY is illegal.
--
-- RLS enabled with no policy (matches 0010): the app connects as table owner and
-- bypasses RLS, while the Supabase Data API roles (anon, authenticated) are denied
-- by default — this is an internal table never exposed to the frontend.
--
-- Reversible:
--   DROP TABLE IF EXISTS dedup_decisions;
-- =============================================================================

BEGIN;

CREATE TABLE dedup_decisions (
    id                   uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id             uuid             NOT NULL,   -- the kept (merge) or created (new) event
    matched_event_id     uuid,                        -- event merged into; NULL when decision='new'
    incoming_occurred_at timestamptz      NOT NULL,
    matched_occurred_at  timestamptz,                 -- NULL when decision='new'
    gap_hours            double precision,            -- |incoming - matched| in hours; NULL when 'new'
    distance_m           double precision,            -- great-circle distance to the match; NULL when 'new'
    window_hours         double precision NOT NULL,   -- dedup_max_time_gap_hours in effect
    radius_km            double precision NOT NULL,   -- RADIUS_KM in effect
    decision             text             NOT NULL CHECK (decision IN ('merge', 'new')),
    created_at           timestamptz      NOT NULL DEFAULT now()
);

-- Supports the over-merge audit query: WHERE decision='merge' AND gap_hours > N.
CREATE INDEX dedup_decisions_decision_created_idx
    ON dedup_decisions (decision, created_at DESC);

ALTER TABLE dedup_decisions ENABLE ROW LEVEL SECURITY;

COMMIT;
