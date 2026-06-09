-- 0028_theater_integrity.sql
-- Theater integrity (BUG-001, BUG-002, BUG-004 from docs/diagnostics/2026-06-09-bug-sweep.md)
--
-- 1. Makes `israel` a first-class, valid theater value (it was previously folded
--    into `iran` in every layer — the bbox split lives in application code:
--    apps/web/lib/queries.ts and apps/ingest/sentinel/db.py).
-- 2. Closes the theater-default leaks:
--      * drops the briefings.theater 'ukraine' DEFAULT so a theater must be set
--        explicitly (BUG-004), and adds a CHECK against the canonical set.
--      * adds a CHECK on sources.theaters: non-empty and every element canonical,
--        so a missing/typo'd theater can no longer slip through and silently
--        fall back to ukraine at routing time (BUG-002).
--
-- Canonical theater set — keep in sync with:
--   apps/ingest/sentinel/pipeline/theater_router.THEATERS
--   apps/web/lib/types.ts  (TheaterKey)
-- NOTE: 'unknown' is an extraction-scope-only sentinel used by the router on a
-- glitch/exception (so a post is still extracted instead of mislabelled ukraine).
-- It is never stored on sources or briefings, so it is intentionally excluded here.
--
-- Existing prod data already satisfies both CHECKs (verified read-only: sources
-- and briefings only use ukraine/iran/sudan/myanmar, all canonical), so the
-- ALTERs validate without rewriting rows.

BEGIN;

-- briefings.theater: drop the silent ukraine default, constrain to the canonical set.
ALTER TABLE briefings ALTER COLUMN theater DROP DEFAULT;

ALTER TABLE briefings
  ADD CONSTRAINT briefings_theater_check
  CHECK (theater IN ('ukraine', 'iran', 'sudan', 'myanmar', 'israel'));

-- sources.theaters: must be non-empty and every element must be canonical.
ALTER TABLE sources
  ADD CONSTRAINT sources_theaters_check
  CHECK (
    cardinality(theaters) > 0
    AND theaters <@ ARRAY['ukraine', 'iran', 'sudan', 'myanmar', 'israel']::text[]
  );

COMMIT;
