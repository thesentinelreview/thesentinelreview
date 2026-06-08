-- =============================================================================
-- 0025_add_geocode_precision_to_events.sql
--
-- Tags how precise each event's coordinate is, so dedup can stop over-merging on
-- shared centroids (D5-1). The extractor LLM emits coordinates as its own best
-- guess — a city centroid when it only knows the city, a country centroid (at
-- integer degrees) when it only knows the country — so distinct incidents stack on
-- one point and the spatial radius can't separate them. There is no geocoder and
-- the model can't reliably grade its own precision, so the tag is derived from
-- coordinate STRUCTURE (kept in sync with pipeline/geocode_precision.py):
--   * integer-degree coordinates / GDELT approximate names -> country
--   * curated admin catch-all centroids                    -> region/country
--   * everything else                                      -> city (the default)
--
-- ADD COLUMN of a NOT NULL column with a constant default is metadata-only on
-- Postgres 11+ (no table rewrite); the CHECK is satisfied by every seeded value.
-- The seed below is the Phase-1 backfill — pure set-based SQL, derivable from
-- coordinates alone (no model calls). Existing city centroids (incl. the ~615
-- coordinate-collision points) keep the 'city' default and need no UPDATE.
--
-- Reversible:
--   ALTER TABLE events DROP COLUMN IF EXISTS geocode_precision;
-- =============================================================================

BEGIN;

ALTER TABLE events ADD COLUMN geocode_precision text NOT NULL DEFAULT 'city'
  CHECK (geocode_precision IN ('exact', 'street', 'city', 'region', 'country', 'unknown'));

-- Rule 1: integer-degree coordinates (country-level guesses) + GDELT approximate
-- names ("approx.", "32°N") -> country.
UPDATE events SET geocode_precision = 'country'
WHERE (ST_X(location) = round(ST_X(location)::numeric)
       AND ST_Y(location) = round(ST_Y(location)::numeric))
   OR location_name ~* 'approx|[0-9]\s*°';

-- Rule 2: curated coarse admin catch-all centroids (gazetteer), matched on
-- 4-decimal coordinates. Keep in sync with geocode_precision.GAZETTEER_COARSE.
UPDATE events SET geocode_precision = 'country'
WHERE (round(ST_X(location)::numeric, 4) = 31.1656 AND round(ST_Y(location)::numeric, 4) = 48.3794)
   OR (round(ST_X(location)::numeric, 4) = 37.8000 AND round(ST_Y(location)::numeric, 4) = 48.0000);

UPDATE events SET geocode_precision = 'region'
WHERE (round(ST_X(location)::numeric, 4) = 37.8028 AND round(ST_Y(location)::numeric, 4) = 48.0159)
   OR (round(ST_X(location)::numeric, 4) = 37.8000 AND round(ST_Y(location)::numeric, 4) = 47.9000);

COMMIT;
