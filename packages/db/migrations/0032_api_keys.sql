-- 0032_api_keys.sql
-- Read API v1 (W2-1): per-user API keys + daily usage metering.
--
-- Keys are never stored in plaintext: key_hash is sha256(full key); key_prefix
-- (first 12 chars) exists only for list display. Tier is NEVER baked into a
-- key — entitlements are re-derived live on every request.
--
-- Idempotent; additive only; no destructive statements. Applied to prod only
-- post-merge via the pipeline migrate.py tick (standing rule, 2026-06-12).

CREATE TABLE IF NOT EXISTS api_keys (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id TEXT        NOT NULL,
    key_hash      TEXT        NOT NULL UNIQUE,
    key_prefix    TEXT        NOT NULL,
    name          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (clerk_user_id);

CREATE TABLE IF NOT EXISTS api_usage (
    key_id     UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    count      INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, usage_date)
);

-- RLS posture per 0031: enabled + explicit deny-all; the app connects as the
-- table owner and bypasses RLS.
ALTER TABLE api_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='api_keys' AND policyname='deny_all') THEN
        CREATE POLICY deny_all ON api_keys FOR ALL USING (false) WITH CHECK (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='api_usage' AND policyname='deny_all') THEN
        CREATE POLICY deny_all ON api_usage FOR ALL USING (false) WITH CHECK (false);
    END IF;
END $$;
