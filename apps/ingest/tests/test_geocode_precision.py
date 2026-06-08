"""Unit tests for sentinel.pipeline.geocode_precision.derive_precision — the
deterministic, structure-derived precision tag (never the model's self-report)."""
from __future__ import annotations

from sentinel.pipeline.geocode_precision import (
    COARSE,
    _coarser,
    _name_tier,
    derive_precision,
)


class TestDerivePrecision:
    def test_integer_degree_is_country(self) -> None:
        assert derive_precision(53.0, 32.0) == "country"          # Iran country centroid
        assert derive_precision(31.0, 49.0) == "country"          # Ukraine country centroid
        assert derive_precision(32.0, 49.0, "Ukraine") == "country"

    def test_near_integer_degree_is_country(self) -> None:
        # Tiny float noise still counts as integer-degree.
        assert derive_precision(53.0000001, 32.0) == "country"

    def test_approximate_name_is_country(self) -> None:
        assert derive_precision(53.1, 32.4, "Central Iran (approx. 32°N, 53°E)") == "country"
        assert derive_precision(44.5, 33.2, "Iran (approximate center)") == "country"

    def test_gazetteer_city_center_is_city(self) -> None:
        assert derive_precision(30.5234, 50.4501, "Kyiv") == "city"
        assert derive_precision(35.0462, 48.4647, "Dnipro") == "city"

    def test_gazetteer_coarse_center_is_coarse(self) -> None:
        assert derive_precision(31.1656, 48.3794, "Ukraine (nationwide)") == "country"
        assert derive_precision(37.8028, 48.0159, "Donetsk Oblast") == "region"

    def test_ordinary_point_defaults_to_city(self) -> None:
        assert derive_precision(37.7104, 48.0712, "Pokrovsk") == "city"

    def test_benign_center_name_does_not_trip_pattern(self) -> None:
        # "center"/"centre" without an approx/degree token must NOT be coarsened.
        assert derive_precision(37.7104, 48.0712, "City Centre, Pokrovsk") == "city"

    def test_coarse_membership(self) -> None:
        assert {"region", "country", "unknown"} <= COARSE
        assert "city" not in COARSE and "exact" not in COARSE


class TestCoarser:
    def test_picks_less_precise_tier(self) -> None:
        assert _coarser("city", "country") == "country"
        assert _coarser("country", "region") == "country"
        assert _coarser("region", "city") == "region"

    def test_equal_tiers_unchanged(self) -> None:
        assert _coarser("city", "city") == "city"


class TestNameTier:
    """The name-derived tier — precision implied by the location_name alone."""

    def test_multiple_areas_is_country(self) -> None:
        assert _name_tier("Russia (multiple regions)") == "country"
        assert _name_tier("Multiple Russian regions (Belgorod, Bryansk, Moscow)") == "country"
        assert _name_tier("Kherson and Kharkiv oblasts") == "country"  # plural 'oblasts'
        assert _name_tier("Multiple axes — Toretsk, Kupiansk, Vovchansk") == "country"

    def test_nationwide_and_theater_is_country(self) -> None:
        assert _name_tier("Ukraine (nationwide)") == "country"
        assert _name_tier("Ukraine (front-wide)") == "country"

    def test_separator_lists_are_country(self) -> None:
        # ';' and '/' list distinct locations in this dataset.
        assert _name_tier("Saratov oil refinery / Lazarievo, Kirov Oblast") == "country"
        assert (
            _name_tier("Volgograd region oil pipeline junction; Crimea oil depot")
            == "country"
        )

    def test_single_admin_area_is_region(self) -> None:
        assert _name_tier("Dnipropetrovsk Oblast") == "region"
        assert _name_tier("Sumy region") == "region"
        assert _name_tier("Donetsk People's Republic (DPR)") == "region"
        assert _name_tier("Fars Province") == "region"

    def test_operational_sector_is_region(self) -> None:
        assert _name_tier("Pokrovsk axis") == "region"
        assert _name_tier("Pokrovsk sector") == "region"
        assert _name_tier("Eastern frontline") == "region"
        assert _name_tier("Pokrovsk direction") == "region"
        assert _name_tier("Battlegroup East area of responsibility") == "region"

    def test_unspecified_point_nation_only_is_country(self) -> None:
        assert _name_tier("Russia (unspecified)") == "country"
        assert _name_tier("Iran (location unspecified)") == "country"
        # An airbase is a point, not an admin area: nation-only -> country.
        assert _name_tier("Saudi Arabia (exact airbase unspecified)") == "country"

    def test_unspecified_point_within_one_area_is_region(self) -> None:
        assert (
            _name_tier("Dnipropetrovsk Oblast (energy facility, exact location unspecified)")
            == "region"
        )

    def test_named_facility_is_protected_city(self) -> None:
        # A specific facility stays dedupable; the coordinate, not the admin area
        # named around it, bounds precision.
        assert _name_tier("Bilets oil depot, Bryansk region") == "city"
        assert _name_tier("Kremenchuk oil refinery") == "city"

    def test_plain_and_benign_names_are_city(self) -> None:
        assert _name_tier("Pokrovsk") == "city"
        assert _name_tier("City Centre, Pokrovsk") == "city"
        # Famous specific target: 'Theatre' (not '-wide') must stay a point.
        assert _name_tier("Mariupol Drama Theatre") == "city"

    def test_word_boundaries_avoid_false_positives(self) -> None:
        # 'waterfront' must not trip \bfront\b; 'Regional' must not trip \bregion\b.
        assert _name_tier("Odesa waterfront") == "city"
        assert _name_tier("Regional clinic, Sumy") == "city"


class TestDerivePrecisionCombinesSignals:
    """derive_precision = coarser-of(coordinate tier, name tier)."""

    def test_coarse_name_downgrades_city_coordinate(self) -> None:
        # The gap fix: region/country-wide events pinned to a city centroid (NOT
        # integer-degree) are now coarse, so the dedup gate excludes them.
        assert derive_precision(37.6173, 55.7558, "Russia (multiple regions)") == "country"
        assert derive_precision(32.6169, 46.6354, "Kherson and Kharkiv oblasts") == "country"
        assert derive_precision(35.0462, 48.4647, "Dnipropetrovsk Oblast") == "region"

    def test_city_name_on_city_coordinate_stays_city(self) -> None:
        # Genuine same-city events keep 'city' and stay dedupable (Tier-1 preserved).
        assert derive_precision(37.6173, 55.7558, "Moscow Oil Refinery") == "city"
        assert derive_precision(37.7104, 48.0712, "Pokrovsk") == "city"

    def test_precise_name_never_upgrades_a_centroid(self) -> None:
        # A specific name does not make a coarse coordinate precise.
        assert derive_precision(53.0, 32.0, "Some refinery in Iran") == "country"  # integer-degree
        assert derive_precision(37.8028, 48.0159, "Donetsk oil refinery") == "region"  # gazetteer

    def test_multiple_overrides_facility_protection(self) -> None:
        assert (
            derive_precision(35.0462, 48.4647, "Saratov oil refinery / Lazarievo, Kirov Oblast")
            == "country"
        )
