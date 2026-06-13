-- =============================================================================
-- 0037_add_russia_nato_theaters.sql
--
-- Add `russia` and `nato_flank` as valid theater values in both CHECK
-- constraints introduced by migration 0029 (briefings_theater_check and
-- sources_theaters_check).
--
-- Both are read-time bbox buckets only — no source.theaters array is relabeled,
-- and no briefing is currently scoped to them. The constraint extension is
-- forward-looking: it makes the schema consistent with the new theater keys in
-- the application layer and allows future briefing generation if needed.
--
-- Reversibility:
--   ALTER TABLE briefings DROP CONSTRAINT briefings_theater_check;
--   ALTER TABLE briefings ADD CONSTRAINT briefings_theater_check
--     CHECK (theater IN ('ukraine','iran','sudan','myanmar','israel'));
--   ALTER TABLE sources DROP CONSTRAINT sources_theaters_check;
--   ALTER TABLE sources ADD CONSTRAINT sources_theaters_check
--     CHECK (cardinality(theaters) > 0
--       AND theaters <@ ARRAY['ukraine','iran','sudan','myanmar','israel']::text[]);
-- =============================================================================

ALTER TABLE briefings DROP CONSTRAINT briefings_theater_check;
ALTER TABLE briefings ADD CONSTRAINT briefings_theater_check
  CHECK (theater IN ('ukraine', 'iran', 'sudan', 'myanmar', 'israel', 'russia', 'nato_flank'));

ALTER TABLE sources DROP CONSTRAINT sources_theaters_check;
ALTER TABLE sources ADD CONSTRAINT sources_theaters_check
  CHECK (
    cardinality(theaters) > 0
    AND theaters <@ ARRAY['ukraine', 'iran', 'sudan', 'myanmar', 'israel', 'russia', 'nato_flank']::text[]
  );
