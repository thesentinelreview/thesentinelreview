-- =============================================================================
-- 0020_gdelt_events_over_gkg.sql
--
-- GDELT was the highest-volume puller yet produced zero events at full LLM cost:
-- the active gdelt_gkg_* sources feed GKG metadata (theme tags + tone + a source
-- URL — no discrete event) to a discrete-event extractor, a category error that
-- burned ~41% of extraction spend for 0 events.
--
-- Switch GDELT to the GDELT 2.0 Events dataset, which IS structured around
-- discrete conflict events (CAMEO action + geo + lat/long). Both ingestors
-- already exist; ingest_source dispatches GdeltGkgIngestor only for handles
-- starting 'gdelt_gkg', and GdeltEventsIngestor for the 'gdelt_<theater>'
-- handles. So this is pure source config:
--   * deactivate the four gdelt_gkg_* (GKG) sources
--   * activate   the four gdelt_<theater> (Events) sources
--
-- Reversible: swap is_active back. Idempotent: UPDATE ... WHERE is idempotent.
-- =============================================================================

BEGIN;

UPDATE sources SET is_active = false
WHERE platform = 'gdelt' AND handle LIKE 'gdelt_gkg_%';

UPDATE sources SET is_active = true
WHERE platform = 'gdelt' AND handle NOT LIKE 'gdelt_gkg_%';

COMMIT;
