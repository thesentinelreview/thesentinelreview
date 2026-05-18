-- =============================================================================
-- 0008_add_raw_post_translation.sql
-- Adds translated_text to raw_posts so the extractor and Source Feed UI can
-- work from an English version of foreign-language posts.
--
-- NULL semantics for translated_text:
--   - Source is already English (lang = 'en')      → NULL
--   - Pre-filter skipped (link-only, empty)         → NULL
--   - Translator failed (JSON parse, API error)     → NULL
--   - Translation succeeded                          → populated
-- =============================================================================

BEGIN;

ALTER TABLE raw_posts
    ADD COLUMN translated_text TEXT;

COMMIT;
