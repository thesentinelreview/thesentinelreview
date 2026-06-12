-- 0033_rename_command_tier_to_admin.sql
-- Rename the internal staff tier value 'command' -> 'admin'. Tier values are
-- now watch / analyst / bureau / admin.
--
-- Access vs tier stay separate (0031 contract unchanged): /admin/* access is
-- still gated by the ADMIN_CLERK_USER_IDS env allowlist; this renames only the
-- tier VALUE stored in tier_grants. user_subscriptions is untouched — its
-- CHECK (watch/analyst/bureau, 0003) never admitted 'command'.
--
-- tier_grants_tier_check is the auto-generated name of the inline column CHECK
-- from 0031 (Postgres names these <table>_<column>_check).
--
-- Idempotent: re-running drops and recreates the same constraint, and the
-- UPDATE no-ops once no 'command' rows remain. migrate.py runs the file in a
-- single transaction, so the constraint gap is never visible to readers.

ALTER TABLE tier_grants DROP CONSTRAINT IF EXISTS tier_grants_tier_check;

UPDATE tier_grants SET tier = 'admin' WHERE tier = 'command';

ALTER TABLE tier_grants ADD CONSTRAINT tier_grants_tier_check
    CHECK (tier IN ('analyst', 'bureau', 'admin'));
