-- =============================================================================
-- 0036_threat_axis_index.sql
--
-- Composite partial index for the Read API's new weapon_type filter path:
-- /api/v1/events?weapon_type=X returns newest-first within one class, so
-- (weapon_type, occurred_at) lets Postgres walk the index for the filtered
-- timeline instead of scanning the class then sorting. Partial on
-- weapon_type IS NOT NULL to match events_weapon_type_idx (0017): the filter
-- param is validated against the 8-class vocabulary upstream, so NULL rows are
-- never selected by this path.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because migrate.py applies each file
-- inside one transaction, where CONCURRENTLY is illegal (0017 precedent).
--
-- Reversible:
--   DROP INDEX IF EXISTS events_weapon_type_occurred_at_idx;
-- =============================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS events_weapon_type_occurred_at_idx
    ON events (weapon_type, occurred_at)
    WHERE weapon_type IS NOT NULL;

COMMIT;
