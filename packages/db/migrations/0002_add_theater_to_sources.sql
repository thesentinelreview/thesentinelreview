-- =============================================================================
-- 0002_add_theater_to_sources.sql
-- Adds theater column to sources so the extraction pipeline knows which
-- LLM system prompt to use when processing posts from each source.
-- =============================================================================

BEGIN;

ALTER TABLE sources
  ADD COLUMN theater TEXT NOT NULL DEFAULT 'ukraine';

COMMIT;
