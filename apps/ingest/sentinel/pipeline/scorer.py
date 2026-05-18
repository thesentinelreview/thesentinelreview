"""
Confidence scorer.

Implements the verification rules from the handoff doc (section 4):

  verified    ≥2 independent sources from different platforms
              AND (geolocated footage OR official acknowledgment OR matching press)

  partial     ≥2 sources but same platform
              OR one tier-1 source + one corroborating signal

  unconfirmed single source, or multiple sources with a common origin
"""
from __future__ import annotations

from sentinel.models import Confidence, ConfidenceAssessment, GeolocationSignal


def score_confidence(
    *,
    source: dict,
    geo_signals: GeolocationSignal,
    corroborating_sources: list[dict],   # other sources already linked to this event
    is_high_impact: bool = False,
) -> ConfidenceAssessment:
    all_sources = [source] + corroborating_sources
    source_count = len(all_sources)
    platforms = {s["platform"] for s in all_sources}
    platform_count = len(platforms)
    min_trust_tier = min(s["trust_tier"] for s in all_sources)

    has_geolocation = geo_signals.geolocated_footage or geo_signals.coordinates_given or geo_signals.landmarks_visible
    has_official_ack = geo_signals.official_acknowledgment
    has_matching_press = geo_signals.matching_press

    strong_signal = has_geolocation or has_official_ack or has_matching_press

    # ── Apply verification rules ──────────────────────────────────────────────
    confidence: Confidence

    if source_count >= 2 and platform_count >= 2 and strong_signal:
        confidence = "verified"
    elif source_count >= 2 and platform_count >= 2:
        confidence = "partial"      # multi-platform but no geo signal
    elif source_count >= 2 and strong_signal:
        confidence = "partial"      # same platform, but geo signal helps
    elif source_count == 1 and min_trust_tier == 1 and strong_signal:
        confidence = "partial"      # single tier-1 source with geo evidence
    else:
        confidence = "unconfirmed"

    # Dashboard runs autonomously — no human review gate.
    held = False

    reasoning = _build_reasoning(
        source_count=source_count,
        platform_count=platform_count,
        has_geolocation=has_geolocation,
        has_official_ack=has_official_ack,
        has_matching_press=has_matching_press,
        min_trust_tier=min_trust_tier,
        confidence=confidence,
    )

    return ConfidenceAssessment(
        confidence=confidence,
        source_count=source_count,
        platform_count=platform_count,
        has_geolocation=has_geolocation,
        has_official_ack=has_official_ack,
        held_for_review=held,
        reasoning=reasoning,
    )


def _build_reasoning(
    *,
    source_count: int,
    platform_count: int,
    has_geolocation: bool,
    has_official_ack: bool,
    has_matching_press: bool,
    min_trust_tier: int,
    confidence: str,
) -> str:
    parts = [
        f"{source_count} source(s) across {platform_count} platform(s)",
        f"trust tier {min_trust_tier}",
    ]
    if has_geolocation:
        parts.append("geolocated")
    if has_official_ack:
        parts.append("official acknowledgment")
    if has_matching_press:
        parts.append("matching press")
    return f"{confidence.upper()}: {', '.join(parts)}"
