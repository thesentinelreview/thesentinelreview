"""Unit tests for sentinel.pipeline.geocode_precision.derive_precision — the
deterministic, structure-derived precision tag (never the model's self-report)."""
from __future__ import annotations

from sentinel.pipeline.geocode_precision import COARSE, derive_precision


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
