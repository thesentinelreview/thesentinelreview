-- ---------------------------------------------------------------------------
-- Schedule periodic refresh of the source_reliability materialized view.
--
-- source_reliability (0001_init.sql) is documented as "refreshed hourly by
-- pg_cron", but the cron.schedule() call was left commented out, so the view
-- never refreshed automatically. Its per-source confidence and activity stats
-- (verified_rate_30d, events_30d, last_event_at) — surfaced on the dashboard —
-- went stale, freezing for days and reading 0% for theaters whose newer events
-- arrived after the last manual refresh.
--
-- pg_cron is enabled on the project, so simply schedule the refresh. Every 30
-- minutes tracks the ingestion cadence. A plain (non-CONCURRENT) refresh is
-- used so the command is transaction-safe under pg_cron; the view is small, so
-- its brief lock is negligible. cron.schedule() upserts by job name, making
-- this idempotent, and the pg_extension guard makes it a no-op where pg_cron is
-- unavailable.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'refresh-source-reliability',
            '*/30 * * * *',
            'REFRESH MATERIALIZED VIEW source_reliability'
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping source_reliability refresh schedule';
    END IF;
END
$$;
