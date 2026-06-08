"""
Deterministic geocode-precision tagging.

The extractor LLM emits coordinates directly (its own best guess), so a centroid
coordinate is the *model's* approximation when it can't pinpoint a place — there is
no geocoder to query, and the model is not a reliable judge of its own precision.
Precision is therefore derived here from coordinate *structure*, never from a model
self-report. The tag gates dedup (pipeline/dedup.py): coarse-precision events
(region/country centroids) are not co-located and must not be merged on a shared
centroid, while city-precision events dedup exactly as before (time-gated).

Three deterministic signals, in priority order:
  1. Integer-degree coordinates  -> country  (the model's country-level guesses,
     e.g. Iran 53,32; Ukraine 31,49). Generic, no curation. GDELT approximate
     names ("…approx. 32°N…", "approximate center") also -> country.
  2. A coordinate in the curated centroid gazetteer -> its tier. Known admin
     centroids: country/region centers -> coarse; major-city centers -> city.
  3. Otherwise -> city (conservative default: at most a city centroid; never
     over-claim exact/street without a geocoder — those are reserved for Phase 3).

Centroid detection itself is the coordinate-collision signal (>=2 distinct
location_names sharing one exact point); it is used at backfill time (migration
0025) and to curate the gazetteer below, not in the per-event forward path (a
single new event cannot self-collide).
"""
from __future__ import annotations

import re

# Precision taxonomy stored in events.geocode_precision. exact/street are reserved
# for a future real geocoder (Phase 3); the deterministic deriver here only ever
# emits country / region / city.
PRECISIONS = ("exact", "street", "city", "region", "country", "unknown")

# Precisions below "city": an event tagged with one of these sits on a centroid we
# cannot treat as a precise location, so dedup must not merge on its coordinate.
COARSE = frozenset({"region", "country", "unknown"})

# Decimal part within this of a whole number ⇒ integer-degree (a country guess).
_INT_DEGREE_EPS = 1e-6

# GDELT-style approximate names: "(approx. 32°N, 53°E)", "approximate center".
_APPROX_RE = re.compile(r"approx|\d\s*°", re.IGNORECASE)

# Gazetteer of known admin centroids -> tier, keyed on (round(lng,4), round(lat,4)).
# Curated from the coordinate-collision review (coordinates where >=2 distinct
# location_names share one point). Major-city centroids are 'city' (they must stay
# dedupable); admin catch-alls with no dominant city are coarse. Integer-degree
# country centroids are caught generically by rule 1 and need no entry here. Keep
# the coarse half in sync with migration 0025's seed.
_GAZETTEER: dict[tuple[float, float], str] = {
    # Major-city centroids — tier 'city' (dedup unchanged; listed explicitly).
    (30.5234, 50.4501): "city",     # Kyiv
    (35.0462, 48.4647): "city",     # Dnipro
    (32.6169, 46.6354): "city",     # Kherson
    (35.1396, 47.8388): "city",     # Zaporizhzhia
    (36.2304, 49.9935): "city",     # Kharkiv
    (30.7233, 46.4825): "city",     # Odesa
    (37.6173, 55.7558): "city",     # Moscow
    (51.5148, 35.7500): "city",     # Tehran
    # Admin catch-all centroids — coarse (excluded from spatial dedup).
    (31.1656, 48.3794): "country",  # "Ukraine (nationwide / theater-wide)"
    (37.8000, 48.0000): "country",  # "Multiple regions / Eastern Ukraine theater"
    (37.8028, 48.0159): "region",   # Donetsk Oblast / DPR (settlement unspecified)
    (37.8000, 47.9000): "region",   # Donetsk Oblast road network / DPR settlements
}

# Coarse gazetteer coordinates, exposed for the migration seed / tests.
GAZETTEER_COARSE: dict[tuple[float, float], str] = {
    coord: tier for coord, tier in _GAZETTEER.items() if tier in COARSE
}


def _is_integer_degree(lng: float, lat: float) -> bool:
    return abs(lng - round(lng)) < _INT_DEGREE_EPS and abs(lat - round(lat)) < _INT_DEGREE_EPS


def derive_precision(lng: float, lat: float, location_name: str | None = None) -> str:
    """Deterministically tag a coordinate's precision from its structure.

    Never consults the model's self-assessment. See the module docstring for the
    three rules; returns one of `country` / `region` / `city`.
    """
    if _is_integer_degree(lng, lat):
        return "country"
    if location_name is not None and _APPROX_RE.search(location_name):
        return "country"
    return _GAZETTEER.get((round(lng, 4), round(lat, 4)), "city")
