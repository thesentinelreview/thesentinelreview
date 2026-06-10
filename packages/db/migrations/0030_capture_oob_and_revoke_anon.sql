-- =============================================================================
-- 0030_capture_oob_and_revoke_anon.sql   (issue #217 follow-up)
--
-- Two jobs, derived from the production catalog of Supabase project
-- ugpqgfvdqupttqhogavc (read-only, 2026-06-09):
--
--   (1) CAPTURE the last out-of-band (applied-but-never-committed) object: the
--       admin_audit_log table. No migration creates it (verified:
--       `grep -rl admin_audit_log packages/db/migrations` -> none). The 0018
--       reconstruction already enables RLS + a deny_all_anon policy on it, but
--       guards on its existence — so on a fresh rebuild the table would never be
--       created at all. This migration creates it (idempotent), so a from-scratch
--       build matches prod. INERT on prod (CREATE IF NOT EXISTS / guarded policy).
--
--   (2) RE-REVOKE the Data API grants 0018 was meant to remove. Production still
--       shows anon/authenticated holding table grants (Supabase auto-grants public
--       objects, which undid 0018's one-time REVOKE). This REVOKE is REAL on prod.
--       Zero user-facing impact: every public table has RLS enabled with
--       default-deny plus explicit deny_all_anon policies, so no anon/authenticated
--       request reaches a row regardless of grants — this just removes the
--       redundant, contradictory grant layer.
--
-- Derivation queries (admin_audit_log shape):
--   SELECT column_name,data_type,is_nullable,column_default
--     FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='admin_audit_log';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid='public.admin_audit_log'::regclass;          -- PRIMARY KEY (id)
--   SELECT indexdef FROM pg_indexes
--     WHERE schemaname='public' AND tablename='admin_audit_log';  -- 3 btree indexes
--
-- Idempotent + role/existence-guarded throughout (house style: 0011, 0018).
-- =============================================================================

BEGIN;

-- (1) Capture admin_audit_log (ghost table) + its indexes, RLS and deny policy.
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id text        NOT NULL,
    action        text        NOT NULL,
    target_table  text        NOT NULL,
    target_id     text,
    before_state  jsonb,
    after_state   jsonb,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log (target_table, target_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
          AND policyname = 'deny_all_anon'
    ) THEN
        CREATE POLICY deny_all_anon ON admin_audit_log
            AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
    END IF;
END $$;

-- (2) Re-revoke Data API grants from anon/authenticated across the public schema.
--     Guarded on role existence (absent on plain Postgres). REAL change on prod.
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
