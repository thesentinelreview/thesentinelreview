-- =============================================================================
-- 0017_add_weapon_type_to_events.sql
--
-- Adds a coarse weapon classification to events — the data foundation for the
-- "Threat Axes" dashboard feature. weapon_type is one of
-- {artillery, drone, missile, armor, infantry, naval, other}, or NULL when no
-- kinetic capability is identifiable (troop movement, statement, humanitarian
-- report). The extractor's record_event tool schema constrains the LLM to that
-- vocabulary at extraction time.
--
-- Deliberately NO CHECK constraint: the vocabulary is expected to grow (e.g. an
-- EW / cyber bucket later) and is enforced upstream at extraction, not by the
-- database. Display bucketing into the six categories lives in the query layer.
--
-- ADD COLUMN of a nullable column with no default is metadata-only (no table
-- rewrite). Plain CREATE INDEX (not CONCURRENTLY) because migrate.py applies
-- each file inside one transaction, where CONCURRENTLY is illegal.
--
-- Reversible:
--   DROP INDEX IF EXISTS events_weapon_type_idx;
--   ALTER TABLE events DROP COLUMN IF EXISTS weapon_type;
-- =============================================================================

BEGIN;

ALTER TABLE events ADD COLUMN weapon_type TEXT;

CREATE INDEX events_weapon_type_idx ON events (weapon_type)
    WHERE weapon_type IS NOT NULL;

COMMIT;
