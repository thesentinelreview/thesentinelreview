-- =============================================================================
-- 0002_add_theater_to_sources.sql
-- Add theater column to sources table to support multi-theater ingestion.
-- Run in Neon SQL editor on the production branch.
-- =============================================================================

BEGIN;

ALTER TABLE sources
  ADD COLUMN theater TEXT NOT NULL DEFAULT 'ukraine'
    CHECK (theater IN ('ukraine', 'iran'));

-- All existing rows are Ukraine sources — default handles them.
-- Update TASS to mark as monitor-only for both theaters (already tier 3).

COMMIT;
