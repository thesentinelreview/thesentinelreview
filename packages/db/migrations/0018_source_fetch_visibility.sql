-- =============================================================================
-- 0018_source_fetch_visibility.sql
--
-- 1. sources.last_fetch_at — timestamp of the most recent ingest attempt
--    (success OR failure). The health columns added in 0015 (health_status,
--    last_post_at, consecutive_errors, last_error_*) were never written by the
--    ingest path, so a silent 0-yield feed looked identical to a healthy one.
--    The ingest_source job now stamps these on every fetch (see
--    db.record_source_fetch); last_fetch_at records the attempt itself so a
--    source that is being polled but yields nothing is distinguishable from one
--    that is never polled.
--
-- 2. Deactivate centcom_sudan — its URL is an exact duplicate of centcom_iran
--    (a CENTCOM feed). Sudan is AFRICOM's area of responsibility, not CENTCOM's,
--    so this row could only ever mislabel CENTCOM/Iran content as the Sudan
--    theater. Reversible: flip is_active back to true (ideally repointed to an
--    AFRICOM feed) if Sudan coverage from a combatant command is wanted.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the UPDATE is naturally idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_fetch_at timestamptz;

UPDATE sources SET is_active = false WHERE handle = 'centcom_sudan';

COMMIT;
