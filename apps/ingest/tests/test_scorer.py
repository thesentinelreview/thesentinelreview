"""
Unit tests for sentinel.pipeline.scorer.score_confidence().

All branches from the handoff verification rules are covered:
  verified   = ≥2 sources, ≥2 platforms, + strong signal
  partial    = ≥2 sources, ≥2 platforms, no strong signal
  partial    = ≥2 sources, 1 platform, + strong signal
  partial    = 1 source, tier-1, + strong signal
  unconfirmed = everything else

held_for_review is independent: it mirrors is_high_impact.
"""
from __future__ import annotations

import pytest

from sentinel.models import GeolocationSignal
from sentinel.pipeline.scorer import _build_reasoning, score_confidence


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _src(platform: str, tier: int) -> dict:
    return {"platform": platform, "trust_tier": tier}


def _geo(**kwargs: bool) -> GeolocationSignal:
    defaults = dict(
        geolocated_footage=False,
        official_acknowledgment=False,
        matching_press=False,
        coordinates_given=False,
        landmarks_visible=False,
    )
    defaults.update(kwargs)
    return GeolocationSignal(**defaults)


# ---------------------------------------------------------------------------
# verified branch
# ---------------------------------------------------------------------------

class TestVerified:
    def test_two_platforms_geolocated(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("x", 2)],
        )
        assert result.confidence == "verified"
        assert result.source_count == 2
        assert result.platform_count == 2
        assert result.has_geolocation is True
        assert result.held_for_review is False

    def test_two_platforms_official_acknowledgment(self) -> None:
        result = score_confidence(
            source=_src("rss", 1),
            geo_signals=_geo(official_acknowledgment=True),
            corroborating_sources=[_src("telegram", 2)],
        )
        assert result.confidence == "verified"
        assert result.has_official_ack is True

    def test_two_platforms_matching_press(self) -> None:
        result = score_confidence(
            source=_src("x", 2),
            geo_signals=_geo(matching_press=True),
            corroborating_sources=[_src("rss", 1)],
        )
        assert result.confidence == "verified"

    def test_three_sources_two_platforms_geolocated(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(coordinates_given=True),
            corroborating_sources=[_src("x", 2), _src("x", 3)],
        )
        assert result.confidence == "verified"
        assert result.source_count == 3
        assert result.platform_count == 2  # telegram + x

    def test_landmarks_visible_counts_as_geo(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(landmarks_visible=True),
            corroborating_sources=[_src("rss", 1)],
        )
        assert result.confidence == "verified"
        assert result.has_geolocation is True


# ---------------------------------------------------------------------------
# partial branch
# ---------------------------------------------------------------------------

class TestPartial:
    def test_two_platforms_no_signal(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(),  # no signals
            corroborating_sources=[_src("rss", 2)],
        )
        assert result.confidence == "partial"

    def test_same_platform_with_geo(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("telegram", 2)],
        )
        assert result.confidence == "partial"
        assert result.platform_count == 1

    def test_tier1_single_source_with_geo(self) -> None:
        result = score_confidence(
            source=_src("rss", 1),
            geo_signals=_geo(official_acknowledgment=True),
            corroborating_sources=[],
        )
        assert result.confidence == "partial"
        assert result.source_count == 1

    def test_tier1_single_source_coordinates(self) -> None:
        result = score_confidence(
            source=_src("wire", 1),
            geo_signals=_geo(coordinates_given=True),
            corroborating_sources=[],
        )
        assert result.confidence == "partial"

    def test_same_platform_multiple_sources_with_signal(self) -> None:
        result = score_confidence(
            source=_src("x", 2),
            geo_signals=_geo(matching_press=True),
            corroborating_sources=[_src("x", 2), _src("x", 2)],
        )
        assert result.confidence == "partial"
        assert result.source_count == 3
        assert result.platform_count == 1


# ---------------------------------------------------------------------------
# unconfirmed branch
# ---------------------------------------------------------------------------

class TestUnconfirmed:
    def test_single_tier2_no_signal(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(),
            corroborating_sources=[],
        )
        assert result.confidence == "unconfirmed"

    def test_single_tier3_with_geo(self) -> None:
        # tier-3 single source + geo still unconfirmed (rule requires tier 1)
        result = score_confidence(
            source=_src("telegram", 3),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[],
        )
        assert result.confidence == "unconfirmed"

    def test_two_sources_same_platform_no_signal(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(),
            corroborating_sources=[_src("telegram", 2)],
        )
        assert result.confidence == "unconfirmed"

    def test_single_tier1_no_signal(self) -> None:
        # tier-1 source but no geo signal → unconfirmed
        result = score_confidence(
            source=_src("rss", 1),
            geo_signals=_geo(),
            corroborating_sources=[],
        )
        assert result.confidence == "unconfirmed"


# ---------------------------------------------------------------------------
# held_for_review
# ---------------------------------------------------------------------------

class TestHeldForReview:
    """
    The dashboard runs fully autonomously — held_for_review is always False,
    regardless of impact or confidence. These tests pin that contract so a
    future change that reintroduces a hold gate has to update them explicitly.
    """

    def test_high_impact_does_not_hold(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("x", 2)],
            is_high_impact=True,
        )
        assert result.held_for_review is False
        assert result.confidence == "verified"   # high-impact doesn't change confidence either

    def test_not_high_impact_not_held(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(),
            corroborating_sources=[],
            is_high_impact=False,
        )
        assert result.held_for_review is False

    def test_unconfirmed_high_impact_does_not_hold(self) -> None:
        result = score_confidence(
            source=_src("telegram", 3),
            geo_signals=_geo(),
            corroborating_sources=[],
            is_high_impact=True,
        )
        assert result.held_for_review is False
        assert result.confidence == "unconfirmed"


# ---------------------------------------------------------------------------
# reasoning string
# ---------------------------------------------------------------------------

class TestReasoning:
    def test_reasoning_prefix_matches_confidence(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("x", 1)],
        )
        assert result.reasoning.startswith("VERIFIED:")

    def test_reasoning_includes_source_count(self) -> None:
        result = score_confidence(
            source=_src("rss", 1),
            geo_signals=_geo(),
            corroborating_sources=[],
        )
        assert "1 source" in result.reasoning

    def test_reasoning_includes_geolocated(self) -> None:
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("rss", 1)],
        )
        assert "geolocated" in result.reasoning

    def test_reasoning_omits_held_marker(self) -> None:
        # The autonomous pipeline never holds, so the reasoning string should
        # not advertise a hold-for-review marker.
        result = score_confidence(
            source=_src("telegram", 2),
            geo_signals=_geo(geolocated_footage=True),
            corroborating_sources=[_src("x", 2)],
            is_high_impact=True,
        )
        assert "held" not in result.reasoning.lower()

    def test_build_reasoning_direct(self) -> None:
        text = _build_reasoning(
            source_count=3,
            platform_count=2,
            has_geolocation=True,
            has_official_ack=True,
            has_matching_press=False,
            min_trust_tier=1,
            confidence="verified",
        )
        assert "VERIFIED" in text
        assert "3 source(s)" in text
        assert "geolocated" in text
        assert "official acknowledgment" in text
        assert "matching press" not in text
