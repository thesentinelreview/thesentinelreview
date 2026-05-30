-- =============================================================================
-- 0018_lockdown_rls_and_revoke_anon_grants.sql
--
-- P0 remediation. Closes the Supabase Data API exposure found in the audit:
-- five public tables have RLS DISABLED while the anon role holds full grants,
-- so the public anon key can read/write them through PostgREST.
--
--   Tables fixed by this migration:
--     admin_audit_log, processed_stripe_events, schema_migrations,
--     candidate_mentions, candidate_sources
--
-- Verified as the anon role (SET ROLE anon): anon could read candidate_sources
-- (97 rows) and schema_migrations, and could INSERT into processed_stripe_events
-- to pre-claim a Stripe event_id -- which makes the webhook treat the genuine
-- event as a duplicate and skip the subscription change
-- (apps/web/app/api/webhooks/stripe/route.ts).
--
-- What this migration does (per the remediation spec):
--   1. Enables RLS on the five tables.
--   2. Adds an EXPLICIT deny-all policy to each, so the deny is intentional and
--      survives future migrations -- we do NOT rely on the implicit
--      "RLS-enabled / no-policy" deny as the mechanism.
--   3. Revokes anon's write privileges (INSERT/UPDATE/DELETE/TRUNCATE) on the
--      five tables. (SELECT is left granted but is blocked by the deny-all
--      policy; TRUNCATE is revoked explicitly because RLS policies do NOT
--      govern TRUNCATE.)
--
-- WHY THIS IS SAFE -- it does not break the app, the webhook, or the pipeline:
--   * Every table is owned by `postgres`, and relforcerowsecurity = false, so
--     the table owner BYPASSES RLS.
--   * The web app connects via a direct `pg` Pool on DATABASE_URL as `postgres`
--     (apps/web/lib/db.ts: new Pool({ connectionString: DATABASE_URL })). There
--     is no supabase-js usage, no anon/service_role Data API key in the app, and
--     no edge functions. migrate.py also connects as postgres. So all
--     server-side reads/writes keep working; only anon/authenticated are denied.
--
--   STRIPE WEBHOOK ROLE (spec item #4): CONFIRMED NOT anon. The handler uses the
--   shared `pg` Pool (lib/db.ts) on DATABASE_URL as the `postgres` table owner,
--   which bypasses RLS, so it keeps working after this migration. (It is not the
--   Supabase "service_role" key either -- it's a direct owner connection, which
--   for RLS-bypass purposes is strictly stronger.) Because the webhook does not
--   run as anon, this migration alone is sufficient; no separate finding needed.
--   PRE-FLIGHT: confirm the prod DATABASE_URL really authenticates as `postgres`
--   (run `select current_user;` over that connection -> must return 'postgres').
--
-- SCOPE NOTE (spec item #7): the OTHER nine public tables -- briefings,
--   event_sources, events, jobs, llm_logs, raw_posts, sources,
--   user_subscriptions, watches -- already have RLS enabled and deny anon by
--   default. They are intentionally LEFT UNTOUCHED here to avoid risking legit
--   reads. FUTURE HARDENING PASS should, for those nine: (a) add explicit
--   deny-all policies (parity with the five above), and (b) revoke the redundant
--   anon/authenticated write grants they still carry. Not done in this migration.
--
-- NOTE: `authenticated` also retains write grants on the five tables below. It
--   is currently unreachable (auth is via Clerk, not Supabase Auth), so it is
--   left for the same future pass; only `anon` writes are revoked here per spec.
--
-- NOT YET APPLIED -- drafted for review.
-- =============================================================================

BEGIN;

-- 1. Enable Row-Level Security -------------------------------------------------
ALTER TABLE admin_audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_mentions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_sources       ENABLE ROW LEVEL SECURITY;

-- 2. Explicit deny-all policies ------------------------------------------------
--    A single PERMISSIVE policy with USING (false) blocks SELECT/UPDATE/DELETE
--    and WITH CHECK (false) blocks INSERT/UPDATE, for every RLS-subject role.
--    The postgres owner bypasses RLS (relforcerowsecurity = false) and so is
--    unaffected; service_role (BYPASSRLS) is likewise unaffected.
CREATE POLICY deny_all_anon ON admin_audit_log         FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY deny_all_anon ON processed_stripe_events FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY deny_all_anon ON schema_migrations       FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY deny_all_anon ON candidate_mentions      FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY deny_all_anon ON candidate_sources       FOR ALL USING (false) WITH CHECK (false);

-- 3. Revoke anon write privileges ---------------------------------------------
--    TRUNCATE is revoked explicitly -- RLS policies do not cover TRUNCATE.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
    admin_audit_log,
    processed_stripe_events,
    schema_migrations,
    candidate_mentions,
    candidate_sources
FROM anon;

COMMIT;

-- =============================================================================
-- VERIFICATION (run manually AFTER applying; NOT executed by this migration)
--
-- Re-runs the audit's anon-role probes. Expected AFTER the fix:
--   * every count returns 0 (reads blocked by the deny-all policy), and
--   * the write probe is rejected ("permission denied" from the revoked grant,
--     or "new row violates row-level security policy" from the deny-all check).
--
--   -- READ probe (was: candidate_sources 97, schema_migrations 18; now all 0):
--   BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT 'admin_audit_log'          AS t, count(*) AS anon_visible_rows FROM admin_audit_log
--   UNION ALL SELECT 'processed_stripe_events', count(*) FROM processed_stripe_events
--   UNION ALL SELECT 'schema_migrations',       count(*) FROM schema_migrations
--   UNION ALL SELECT 'candidate_mentions',      count(*) FROM candidate_mentions
--   UNION ALL SELECT 'candidate_sources',       count(*) FROM candidate_sources;
--   RESET ROLE;
--   ROLLBACK;
--
--   -- WRITE probe (must be rejected for anon):
--   BEGIN;
--   SET LOCAL ROLE anon;
--   INSERT INTO processed_stripe_events (event_id, event_type)
--     VALUES ('evt_rls_probe', 'probe');
--   RESET ROLE;
--   ROLLBACK;
--
-- Then re-run Supabase Advisors (Security): rls_disabled_in_public should clear
-- for all five tables.
-- =============================================================================
