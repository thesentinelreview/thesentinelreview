-- =============================================================================
-- 0010_enable_rls.sql
-- Enable Row-Level Security on all public tables. The application connects as
-- the table owner (postgres), which bypasses RLS, so server-side queries are
-- unaffected. With RLS enabled and no policies, the Supabase Data API roles
-- (anon, authenticated) are denied by default. Add explicit policies only if
-- the Data API is ever used client-side.
-- =============================================================================

BEGIN;

ALTER TABLE sources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE watches            ENABLE ROW LEVEL SECURITY;

COMMIT;
