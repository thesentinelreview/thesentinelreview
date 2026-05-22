from datetime import datetime, timezone

import pytest

from bsky_osint.models import CandidateSource
from bsky_osint.scoring import score_candidate

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _make(
    regions=None,
    description="",
    relevant_posts=0,
    media_posts=0,
    primary_links=0,
    recent_scanned=0,
    handle="test.bsky.social",
):
    return CandidateSource(
        handle=handle,
        regions=regions or ["Ukraine"],
        description=description,
        relevant_posts_count=relevant_posts,
        media_posts_count=media_posts,
        primary_source_link_count=primary_links,
        recent_posts_scanned=recent_scanned,
        first_seen_at=_NOW,
    )


def test_zero_posts_scores_low():
    src = _make(relevant_posts=0)
    score, confidence, rationale = score_candidate(src)
    assert score < 50
    assert confidence == "low"


def test_high_confidence_threshold():
    src = _make(
        description="Ukraine journalist conflict war reporter",
        relevant_posts=10,
        media_posts=8,
        primary_links=8,
        recent_scanned=10,
        handle="kyivindependent.com",
    )
    score, confidence, _ = score_candidate(src)
    assert score >= 75
    assert confidence == "high"


def test_medium_confidence_range():
    src = _make(
        description="Ukraine news reporter conflict",
        relevant_posts=5,
        media_posts=4,
        primary_links=3,
        recent_scanned=10,
    )
    score, confidence, _ = score_candidate(src)
    assert 50 <= score < 75
    assert confidence == "medium"


def test_domain_handle_adds_affiliation_points():
    with_domain = _make(handle="bellingcat.com", relevant_posts=0)
    without_domain = _make(handle="randomuser.bsky.social", relevant_posts=0)
    s1, _, _ = score_candidate(with_domain)
    s2, _, _ = score_candidate(without_domain)
    assert s1 > s2


def test_all_media_posts_scores_higher_than_no_media():
    with_media = _make(relevant_posts=5, media_posts=5, recent_scanned=5)
    without_media = _make(relevant_posts=5, media_posts=0, recent_scanned=5)
    s1, _, _ = score_candidate(with_media)
    s2, _, _ = score_candidate(without_media)
    assert s1 > s2


def test_score_capped_at_100():
    src = _make(
        description="Ukraine journalist conflict osint researcher defense policy war press news editor",
        relevant_posts=20,
        media_posts=20,
        primary_links=20,
        recent_scanned=20,
        handle="perfect.example.com",
    )
    score, _, _ = score_candidate(src)
    assert score <= 100.0


def test_rationale_non_empty_for_signals():
    src = _make(relevant_posts=5, media_posts=3, recent_scanned=5)
    _, _, rationale = score_candidate(src)
    assert rationale != "insufficient signals"


def test_no_signals_rationale():
    src = _make()
    _, _, rationale = score_candidate(src)
    assert rationale == "insufficient signals"
