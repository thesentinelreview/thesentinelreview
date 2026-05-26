-- =============================================================================
-- 0016_deactivate_silent_telegram_channels.sql
--
-- Deactivates six Telegram sources that have never produced an ingestable post.
-- Basis: the ingestion audit in PR #124 flagged them as permanently silent
-- (last_post_at = null). Re-verified before writing this migration: all six
-- have zero rows in raw_posts all-time, including zero since their handles were
-- corrected on 2026-05-24 (~2 days / ~96 ingest cycles of valid handles with no
-- output). Telegram coverage stays healthy via tasnimnews_en, rybar, dva_majors,
-- wargonzo, and DeepStateUA.
--
-- Reversible: flip is_active back to true if a channel resumes posting.
-- =============================================================================

BEGIN;

UPDATE sources
SET is_active = false
WHERE platform = 'telegram'
  AND handle IN (
    'warmonitor3', 'IranIntl_En', 'UAControlMap',
    'UkrainianFront', 'irgcnews', 'militarylandnet'
  );

COMMIT;
