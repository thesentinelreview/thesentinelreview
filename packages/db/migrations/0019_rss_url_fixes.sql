-- =============================================================================
-- 0019_rss_url_fixes.sql
--
-- Repoint two RSS sources at their real, working feed URLs. Both were silently
-- yielding nothing in the ingest fetch path; the sentinel-probe-feeds one-shot
-- (run 2026-05-29 ~01:40 UTC) confirmed the correct endpoints from the Actions
-- runner's egress, recording HTTP status / content-type / entry count per
-- candidate in feed_probe_results:
--
--   * iranintl_rss  — old URL returned the JS single-page-app HTML shell
--     (text/html, 0 entries). Real English-edition feed:
--     https://www.iranintl.com/en/feed  (200 application/xml, 100 entries).
--
--   * mizzima_rss   — old URL was a stale category feed (0 entries). Canonical
--     WordPress feed: https://eng.mizzima.com/feed/  (200 rss+xml, 10 entries).
--
-- Then drop feed_probe_results — it is a one-time diagnostic scratch table
-- created by the probe (CREATE TABLE IF NOT EXISTS), not part of the core schema.
--
-- Idempotent: UPDATE ... WHERE handle is naturally idempotent; DROP IF EXISTS.
-- =============================================================================

BEGIN;

UPDATE sources SET url = 'https://www.iranintl.com/en/feed' WHERE handle = 'iranintl_rss';

UPDATE sources SET url = 'https://eng.mizzima.com/feed/' WHERE handle = 'mizzima_rss';

DROP TABLE IF EXISTS feed_probe_results;

COMMIT;
