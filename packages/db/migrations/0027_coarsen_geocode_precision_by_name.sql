-- =============================================================================
-- 0027_coarsen_geocode_precision_by_name.sql
--
-- Closes the name-granularity gap left by 0025 (D5-1). 0025 derives precision from
-- the COORDINATE, but precision is really a property of the location_name: a single
-- busy city centroid (e.g. Moscow 55.7558,37.6173, which is not integer-degree) hosts
-- "Moscow Oil Refinery", "Moscow", AND "Russia (multiple regions)" on one point. The
-- coordinate rule tags all of them 'city', so the region/country-wide ones stay
-- merge-eligible and over-merge — the exact class the precision gate exists to stop.
--
-- Fix: geocode_precision = coarser-of(coordinate tier from 0025, name tier here). An
-- event is only as precise as its least precise signal. This only ever DOWNGRADES a
-- city coordinate whose NAME is coarse; it never upgrades (a specific name does not
-- make a centroid precise), so genuine same-city events keep 'city' and stay
-- dedupable — Tier-1 de-fragmentation is preserved.
--
-- The name tier mirrors pipeline/geocode_precision._name_tier (keep in sync), same
-- precedence: multiple-areas/nationwide -> country; an explicitly-unspecified point
-- -> region if one area is still named else country; a single named facility/street
-- -> city (protected); a single admin area / operational sector -> region; else city.
-- Validated read-only against production: 222 rows move city->region and 171
-- city->country (393 total); the only coarse-token name kept 'city' is a protected
-- oil depot, and the only names coarsened without an admin token are operational
-- "X direction" axes (correctly coarse).
--
-- Pure set-based SQL (no model calls); runs after 0025 so geocode_precision exists.
-- Reversible: re-run 0025's seed, or recompute from pipeline/geocode_precision.
-- =============================================================================

BEGIN;

-- country-tier names: multiple distinct areas / a whole nation or theater, or an
-- unspecified point that names only a nation. Coarsens city/region -> country.
UPDATE events SET geocode_precision = 'country'
WHERE geocode_precision IN ('exact', 'street', 'city', 'region')
  AND (
        location_name ~* '\mmultiple\M|nationwide|countrywide|front-?wide|theat(er|re)-?wide|\moblasts\M|\mregions\M|\mfronts\M|\maxes\M|;|/'
     OR (location_name ~* 'unspecified|unidentified|not (stated|specified|identified)'
         AND location_name !~* 'oblast|\mregion\M|\mprovince\M|governorate|\mkrai\M|people.?s republic|\mDPR\M|\mLPR\M|\maxis\M|\msector|\mfront\M|frontline')
      );

-- region-tier names: a single admin area or operational sector, when the name is not
-- multiple (above), not a nation-only unspecified (above), and not a protected single
-- named facility/street. Coarsens city -> region only (never touches region/country).
UPDATE events SET geocode_precision = 'region'
WHERE geocode_precision IN ('exact', 'street', 'city')
  AND location_name !~* '\mmultiple\M|nationwide|countrywide|front-?wide|theat(er|re)-?wide|\moblasts\M|\mregions\M|\mfronts\M|\maxes\M|;|/'
  AND (
        (location_name ~* 'unspecified|unidentified|not (stated|specified|identified)'
         AND location_name ~* 'oblast|\mregion\M|\mprovince\M|governorate|\mkrai\M|people.?s republic|\mDPR\M|\mLPR\M|\maxis\M|\msector|\mfront\M|frontline')
     OR (location_name !~* 'unspecified|unidentified|not (stated|specified|identified)'
         AND location_name !~* 'refinery|depot|\mplant\M|terminal|\mairport\M|air ?base|substation|pipeline|pumping station|\mstreet\M'
         AND location_name ~* 'oblast|\mregion\M|\mprovince\M|governorate|\mkrai\M|people.?s republic|\mDPR\M|\mLPR\M|\mDNR\M|\mLNR\M|\maxis\M|\msector|\mfront\M|frontline|front line|area of (operations|responsibility)|\mAOR\M|battlegroup|\mdirection\M|airspace')
      );

COMMIT;
