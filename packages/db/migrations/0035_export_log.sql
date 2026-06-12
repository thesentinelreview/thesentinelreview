-- 0035_export_log.sql
-- Customer exports (W2-2): one row per delivered export file. The table is
-- both the audit trail (who exported what, when — ToS enforcement on the
-- no-redistribution data license) and the daily meter: the per-user cap is
-- COUNT(*) of the user's rows for the current UTC day. Deliberately separate
-- from api_usage so a dashboard export never decrements the API call quota.
--
-- Idempotent; additive only; no destructive statements. Applied to prod only
-- post-merge via the pipeline migrate.py tick (standing rule, 2026-06-12).

CREATE TABLE IF NOT EXISTS export_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT        NOT NULL,    -- Clerk user id
    tier          TEXT        NOT NULL,    -- canonical tier at export time (analyst/bureau/admin)
    theater_scope TEXT        NOT NULL,
    window_start  TIMESTAMPTZ NOT NULL,
    window_end    TIMESTAMPTZ NOT NULL,
    format        TEXT        NOT NULL CHECK (format IN ('csv', 'json')),
    row_count     INT         NOT NULL,
    truncated     BOOLEAN     NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves both the daily meter (user_id + created_at range scan from UTC
-- midnight) and per-user audit reads, newest first.
CREATE INDEX IF NOT EXISTS export_log_user_created_idx
    ON export_log (user_id, created_at DESC);

-- RLS posture per 0031/0032: enabled + explicit deny-all; the app connects as
-- the table owner and bypasses RLS.
ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='export_log' AND policyname='deny_all') THEN
        CREATE POLICY deny_all ON export_log FOR ALL USING (false) WITH CHECK (false);
    END IF;
END $$;
