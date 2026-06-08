-- =============================================================================
-- 0026_add_precision_to_dedup_decisions.sql
--
-- Logs the geocode_precision of both sides of every matcher decision, so the
-- precision-aware dedup gate (D5-1 Phase 2) is auditable alongside the existing
-- gap/distance fields. A coarse-incoming 'new' decision records incoming_precision
-- with matched_precision NULL, surfacing events that skipped dedup on precision.
--
-- Nullable, no default — metadata-only ADD COLUMN, no table rewrite.
--
-- Reversible:
--   ALTER TABLE dedup_decisions
--     DROP COLUMN IF EXISTS incoming_precision,
--     DROP COLUMN IF EXISTS matched_precision;
-- =============================================================================

BEGIN;

ALTER TABLE dedup_decisions
  ADD COLUMN incoming_precision text,
  ADD COLUMN matched_precision  text;

COMMIT;
