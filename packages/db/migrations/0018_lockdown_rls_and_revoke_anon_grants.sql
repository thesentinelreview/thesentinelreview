-- =============================================================================
-- 0018_lockdown_rls_and_revoke_anon_grants.sql
--
-- RECONSTRUCTED 2026-06-09 (issue #217, Phase B).
--
-- This migration was applied directly to production and never committed — it is
-- recorded in schema_migrations but no file ever existed in the repo (git
-- history confirms: zero add/delete of this path in any branch). It is the same
-- "applied ad-hoc, never mirrored" pattern as 0015. Recovered here so the ledger
-- and the repo reconcile and `migrate.py --verify` reports zero ghosts.
--
-- SOURCE OF TRUTH: the live production catalog of Supabase project
-- ugpqgfvdqupttqhogavc, read-only on 2026-06-09. The exact original text is
-- unrecoverable; this reconstruction reproduces the observed END STATE that is
-- attributable to this migration. Derivation queries:
--
--   -- tables left without RLS by 0010 (which only covered the 0001 base set)
--   -- but RLS-enabled in prod, each carrying a belt-and-suspenders deny policy:
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--     FROM pg_policies WHERE schemaname='public';            -- -> 5x deny_all_anon
--   SELECT c.relname, c.relrowsecurity FROM pg_class c
--     JOIN pg_namespace n ON n.oid=c.relnamespace
--     WHERE n.nspname='public' AND c.relkind='r';            -- -> all base tables RLS on
--
-- NOTE on the "revoke_anon_grants" half: production currently still shows
-- anon/authenticated holding table grants (verified 2026-06-09). Supabase
-- auto-grants privileges on public objects to anon/authenticated, which undoes a
-- one-time REVOKE for objects created afterward — so the REVOKE below did run but
-- did not persist. It is harmless today because RLS is enabled on every table
-- with default-deny (and the explicit deny policies below), so no permissive
-- policy opens any table to anon/authenticated. The non-persistence of the
-- REVOKE is logged as a separate live finding on issue #217 (a re-revoke against
-- prod, if wanted, is a deliberate gated action — NOT performed by this file).
--
-- IDEMPOTENT + forward-apply-safe: every statement is guarded on object/role
-- existence, so a fresh-DB apply at this position skips objects not yet created
-- (and re-running is a no-op). Because 0018 is already in schema_migrations, the
-- live runner never re-executes this file — it is documentation of history that
-- only runs when a database is rebuilt from migrations.
-- =============================================================================

BEGIN;

-- 1. Enable RLS + an explicit deny-all policy for the Supabase Data API roles on
--    the tables 0010 did not cover. (RLS with no permissive policy already denies
--    anon/authenticated; the deny policy is defense-in-depth and matches prod.)
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'candidate_sources',
        'candidate_mentions',
        'processed_stripe_events',
        'schema_migrations',
        'admin_audit_log'   -- NB: admin_audit_log is itself an uncommitted/ghost
                            -- table (no migration creates it) — see issue #217.
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = t AND policyname = 'deny_all_anon'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY deny_all_anon ON public.%I AS PERMISSIVE '
                    'FOR ALL TO public USING (false) WITH CHECK (false)', t
                );
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. Revoke Data API grants from anon/authenticated across the public schema.
--    Guarded on role existence (absent on plain Postgres). Supabase may re-grant
--    these for objects created later (see header note).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    END IF;
END $$;

COMMIT;
