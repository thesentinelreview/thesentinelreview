-- =============================================================================
-- 0028_source_health_function.sql
--
-- Make sources.health_status a function of DURABLE signals (recency of the last
-- post + consecutive_errors), not the current 30-minute fetch window.
--
-- Bug 1 — health flapped on cadence, not liveness. health_status was computed
--   per fetch cycle (db._classify_fetch): a healthy low-cadence feed was stamped
--   'silent' on every empty cycle and 'healthy' only on the rare cycle it posted,
--   while a feed dead for weeks read 'healthy' on one stray post.
-- Bug 2 — last_post_at only advanced for RSS (meta newest_posted_at), so
--   telegram/x/bluesky/gdelt sources kept a NULL/stale last_post_at despite
--   accumulating raw_posts, making recency-based health impossible.
--
-- Fix: a single SQL function, recompute_source_health(), is the SOLE author of
-- health_status. Three callers share this one definition (no drift):
--   * per-fetch  — db.record_source_fetch(source_id)  [single-source mode]
--   * hourly     — pg_cron job scheduled below          [bulk mode]
--   * backfill   — the one-time SELECT at the end here  [bulk mode]
-- Labels:
--   healthy  — last post within 14 days. Covers low-cadence tier-1/2 feeds
--              (~11-day cadence observed); no active, ever-posted source is quiet
--              longer than 14 days, so this cleanly separates alive from dark.
--   silent   — has posted before, but not within 14 days.
--   unknown  — never posted.
--   erroring — consecutive_errors >= 10 (persistent failure). For a 1-9 streak
--              the fetch path's specific label (url_broken/erroring) is preserved.
-- All labels are within the existing sources_health_status_check enum (0015), so
-- no constraint change is needed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, and
-- cron.schedule() upserts by job name. The pg_extension guard makes the schedule
-- a no-op where pg_cron is unavailable (dev / preview branches).
-- =============================================================================

-- When the label was last derived (stamped on every recompute).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS health_status_updated_at timestamptz;

CREATE OR REPLACE FUNCTION recompute_source_health(p_source_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    n integer;
BEGIN
    -- Bulk mode (pg_cron + backfill): reconcile last_post_at from raw_posts
    -- first, so sources not fetched recently — or whose forward stamp was missed
    -- — stay accurate. raw_posts is the source of truth; last_post_at is a
    -- maintained cache. Single-source mode (per-fetch) trusts the forward stamp
    -- that record_source_fetch just wrote and skips the scan.
    IF p_source_id IS NULL THEN
        UPDATE sources s
        SET last_post_at = sub.max_posted
        FROM (
            SELECT source_id, max(posted_at) AS max_posted
            FROM raw_posts
            GROUP BY source_id
        ) sub
        WHERE s.id = sub.source_id
          AND (s.last_post_at IS NULL OR s.last_post_at < sub.max_posted);
    END IF;

    UPDATE sources s
    SET health_status = CASE
            WHEN s.consecutive_errors >= 10 THEN 'erroring'
            WHEN s.consecutive_errors >= 1  THEN s.health_status  -- transient: keep fetch-path label
            WHEN s.last_post_at >= now() - interval '14 days' THEN 'healthy'
            WHEN s.last_post_at IS NOT NULL THEN 'silent'
            ELSE 'unknown'
        END,
        health_status_updated_at = now()
    WHERE p_source_id IS NULL OR s.id = p_source_id;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

COMMENT ON FUNCTION recompute_source_health(uuid) IS
    'Sole author of sources.health_status, derived from durable signals '
    '(last_post_at recency, 14-day window; consecutive_errors). NULL arg = all '
    'sources and also reconciles last_post_at from raw_posts; a source id = that '
    'source only. Callers: db.record_source_fetch (per-fetch), the pg_cron '
    'recompute-source-health job (hourly), and the backfill in migration 0028.';

-- One-time backfill: heal every legacy NULL/stale last_post_at from raw_posts and
-- set every label correctly under the new rules.
SELECT recompute_source_health();

-- Hourly recompute. Catches the 14-day boundary crossing for feeds that are not
-- currently being fetched, and reconciles any last_post_at drift. pg_cron is
-- enabled on production (it already runs refresh-source-reliability, 0014); the
-- guard no-ops on environments without it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'recompute-source-health',
            '0 * * * *',
            'SELECT recompute_source_health()'
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping recompute-source-health schedule';
    END IF;
END
$$;
