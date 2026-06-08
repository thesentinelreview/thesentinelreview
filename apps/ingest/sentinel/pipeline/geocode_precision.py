"""
Deterministic geocode-precision tagging.

The extractor LLM emits coordinates directly (its own best guess), so a centroid
coordinate is the *model's* approximation when it can't pinpoint a place — there is
no geocoder to query, and the model is not a reliable judge of its own precision.
Precision is therefore derived here from structure, never from a model self-report.
The tag gates dedup (pipeline/dedup.py): coarse-precision events (region/country
centroids) are not co-located and must not be merged on a shared centroid, while
city-precision events dedup exactly as before (time-gated).

Precision has TWO independent structural signals, and an event is only as precise as
its *least* precise one, so they are combined with `coarser_of`:

  • Coordinate tier (`_coordinate_tier`) — what the *point* can resolve:
      1. Integer-degree coordinates -> country (the model's country-level guesses,
         e.g. Iran 53,32; Ukraine 31,49). Generic, no curation. GDELT approximate
         names ("…approx. 32°N…", "approximate center") also -> country.
      2. A coordinate in the curated centroid gazetteer -> its tier. Known admin
         centroids: country/region centers -> coarse; major-city centers -> city.
      3. Otherwise -> city (conservative default: at most a city centroid; never
         over-claim exact/street without a geocoder — reserved for Phase 3).

  • Name tier (`_name_tier`) — what the `location_name` *denotes*. A busy city
    centroid (e.g. Moscow 55.7558,37.6173, which is NOT integer-degree) hosts a mix
    of granularities: "Moscow Oil Refinery", "Moscow", and "Russia (multiple
    regions)" all share that one point. The coordinate tier alone would tag the
    region/country-wide ones `city` and let them slip past the dedup gate, so the
    name is read for an area/theater marker (oblast, region, "multiple regions",
    front/axis/sector, People's Republic, "(unspecified)", …). This signal only ever
    *downgrades* a city coordinate whose name is coarse; a precise name never
    upgrades a centroid (the point still can't locate it), so genuine same-city
    events keep their `city` tag and stay dedupable.

Both signals are deterministic and never consult the model's self-assessment.
Centroid detection itself is the coordinate-collision signal (>=2 distinct
location_names sharing one exact point); it is used at backfill time (migrations
0025/0027) and to curate the gazetteer below, not in the per-event forward path (a
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

# Precision ordering, fine -> coarse. coarser_of() picks the less precise of two
# tiers, so combining the coordinate and name signals can only ever lose precision.
_PRECISION_RANK = {"exact": 0, "street": 1, "city": 2, "region": 3, "country": 4, "unknown": 5}

# Decimal part within this of a whole number ⇒ integer-degree (a country guess).
_INT_DEGREE_EPS = 1e-6

# GDELT-style approximate names: "(approx. 32°N, 53°E)", "approximate center".
_APPROX_RE = re.compile(r"approx|\d\s*°", re.IGNORECASE)

# ── Name-tier patterns ───────────────────────────────────────────────────────────
# Read from location_name to detect an area/theater the *point* can't reveal. Mirror
# of migration 0027; keep the two in sync. Word boundaries (\b) keep "region" from
# matching "Regional" and "front" from matching "waterfront".

# MULTIPLE distinct areas / a whole nation or theater -> country. Plural admin forms
# ("oblasts"/"regions") and the ';' / '/' separators reliably list distinct locations
# in this dataset ("…; Krasnodar region radar station; Crimea oil depot").
_NAME_MULTI = re.compile(
    r"\bmultiple\b|nationwide|countrywide|front-?wide|theat(?:er|re)-?wide"
    r"|\boblasts\b|\bregions\b|\bfronts\b|\baxes\b|[;/]",
    re.IGNORECASE,
)
# The specific point is explicitly not known ("(exact location unspecified)").
_NAME_UNSPEC = re.compile(
    r"unspecified|unidentified|not (?:stated|specified|identified)", re.IGNORECASE
)
# A single named facility / street: precise enough to keep dedupable — the coordinate,
# not the admin area named around it, bounds the precision ("Bilets oil depot, Bryansk
# region"). MULTIPLE (above) overrides this; an unspecified point (above) is not a
# located facility, so it is checked first too.
_NAME_POINT = re.compile(
    r"refinery|depot|\bplant\b|terminal|\bairport\b|air ?base|substation"
    r"|pipeline|pumping station|\bstreet\b",
    re.IGNORECASE,
)
# A single administrative area or operational sector -> region.
_NAME_AREA = re.compile(
    r"oblast|\bregion\b|\bprovince\b|governorate|\bkrai\b|people.?s republic"
    r"|\bDPR\b|\bLPR\b|\bDNR\b|\bLNR\b|\baxis\b|\bsector|\bfront\b|frontline|front line"
    r"|area of (?:operations|responsibility)|\bAOR\b|battlegroup|\bdirection\b|airspace",
    re.IGNORECASE,
)
# Area subset that splits an "(unspecified)" name into region (one area still named)
# vs country (only a nation named). Mirror of the same branch in migration 0027.
_NAME_AREA_FOR_UNSPEC = re.compile(
    r"oblast|\bregion\b|\bprovince\b|governorate|\bkrai\b|people.?s republic"
    r"|\bDPR\b|\bLPR\b|\baxis\b|\bsector|\bfront\b|frontline",
    re.IGNORECASE,
)

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


def _coarser(a: str, b: str) -> str:
    """Return the less precise (coarser) of two precision tiers."""
    return a if _PRECISION_RANK[a] >= _PRECISION_RANK[b] else b


def _coordinate_tier(lng: float, lat: float, location_name: str | None) -> str:
    """Precision the *coordinate* can resolve: country (integer-degree / approximate
    name), the gazetteer tier for a known centroid, else the city default."""
    if _is_integer_degree(lng, lat):
        return "country"
    if location_name is not None and _APPROX_RE.search(location_name):
        return "country"
    return _GAZETTEER.get((round(lng, 4), round(lat, 4)), "city")


def _name_tier(location_name: str) -> str:
    """Coarsest precision implied by the location *name* alone (city/region/country).

    Precedence (mirrors migration 0027): multiple areas / nationwide -> country; an
    explicitly-unspecified point -> region when it still names one area, else country;
    a single named facility/street -> city (protected, stays dedupable); a single
    admin area or operational sector -> region; anything else -> city. Returns a tier
    no finer than the name warrants and no coarser, so the coarser-of combine in
    derive_precision can downgrade a city coordinate but never upgrade a centroid.
    """
    if _NAME_MULTI.search(location_name):
        return "country"
    if _NAME_UNSPEC.search(location_name):
        return "region" if _NAME_AREA_FOR_UNSPEC.search(location_name) else "country"
    if _NAME_POINT.search(location_name):
        return "city"
    if _NAME_AREA.search(location_name):
        return "region"
    return "city"


def derive_precision(lng: float, lat: float, location_name: str | None = None) -> str:
    """Deterministically tag an event's precision from its structure.

    Combines two independent signals — what the coordinate can resolve and what the
    name denotes — taking the coarser, because an event is only as precise as its
    least precise signal. Never consults the model's self-assessment. Returns one of
    `country` / `region` / `city`.
    """
    coord = _coordinate_tier(lng, lat, location_name)
    name = _name_tier(location_name) if location_name else "city"
    return _coarser(coord, name)
