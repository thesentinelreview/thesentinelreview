-- 0031_tier_grants.sql
-- Tier grants (W1-4 admin v1): staff-issued customer-tier overrides.
--
-- Access vs tier, permanently separated: /admin/* access stays gated by the
-- ADMIN_CLERK_USER_IDS env allowlist; customer TIER comes only from
-- subscriptions and this table. Retires the JC1 temporary bridge
-- (allowlist -> command mapping in lib/entitlements).
--
-- Entitlements precedence: active grant (revoked_at IS NULL) > qualifying
-- subscription > watch.
--
-- Idempotent; additive only; no destructive statements.

CREATE TABLE IF NOT EXISTS tier_grants (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT        NOT NULL UNIQUE,
    tier          TEXT        NOT NULL CHECK (tier IN ('analyst', 'bureau', 'command')),
    note          TEXT,
    granted_by    TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tier_grants_user_idx ON tier_grants (clerk_user_id);

-- RLS posture matches the rest of public (0010/0018 pattern): enabled with an
-- explicit deny-all policy. The app connects as the table owner and bypasses
-- RLS; anon/authenticated have no path in.
ALTER TABLE tier_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tier_grants' AND policyname = 'deny_all'
    ) THEN
        CREATE POLICY deny_all ON tier_grants FOR ALL USING (false) WITH CHECK (false);
    END IF;
END $$;
