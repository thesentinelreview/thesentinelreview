from datetime import datetime, timezone

import pytest

from bsky_osint.models import CandidateSource, RawPost, SamplePost
from bsky_osint.safety import check_candidate, filter_posts, flag_sensitive

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _post(text: str, handle: str = "user.bsky.social") -> RawPost:
    return RawPost(
        uri=f"at://{handle}/app.bsky.feed.post/abc",
        author_handle=handle,
        text=text,
        created_at=_NOW,
    )


def test_clean_post_passes_through():
    posts = [_post("Airstrike reported near Kharkiv. Video attached.")]
    result = filter_posts(posts)
    assert len(result) == 1


def test_email_in_post_is_dropped():
    posts = [_post("Contact john.doe@example.com for more info")]
    result = filter_posts(posts)
    assert len(result) == 0


def test_home_address_in_post_is_dropped():
    posts = [_post("He lives at 42 Maple Street, Springfield")]
    result = filter_posts(posts)
    assert len(result) == 0


def test_violence_post_is_dropped():
    posts = [_post("Someone should kill him for this")]
    result = filter_posts(posts)
    assert len(result) == 0


def test_mixed_posts_only_drops_bad():
    posts = [
        _post("Drone strike reported in Kharkiv region"),
        _post("Contact us at secret@domain.com"),
        _post("Analysis of frontline shifts near Zaporizhzhia"),
    ]
    result = filter_posts(posts)
    assert len(result) == 2
    assert all("@" not in p.text for p in result)


def test_tactical_flag_triggers():
    src = CandidateSource(
        handle="user.bsky.social",
        regions=["Ukraine"],
        sample_posts=[
            SamplePost(
                text="Troop position at grid 48.1234, 37.5678",
                created_at=_NOW,
                url="https://bsky.app/profile/user.bsky.social/post/abc",
            )
        ],
    )
    result = flag_sensitive(src)
    assert result.sensitive is True


def test_non_tactical_post_not_flagged():
    src = CandidateSource(
        handle="user.bsky.social",
        regions=["Ukraine"],
        sample_posts=[
            SamplePost(
                text="ISW publishes updated assessment of Kherson region",
                created_at=_NOW,
                url="https://bsky.app/profile/user.bsky.social/post/abc",
            )
        ],
    )
    result = flag_sensitive(src)
    assert result.sensitive is False


def test_check_candidate_rejects_violence_in_bio():
    src = CandidateSource(
        handle="bad.bsky.social",
        description="I want to hunt down everyone who disagrees",
        regions=["Ukraine"],
    )
    assert check_candidate(src) is False


def test_check_candidate_accepts_clean():
    src = CandidateSource(
        handle="good.bsky.social",
        description="OSINT researcher focused on Ukraine conflict",
        regions=["Ukraine"],
    )
    assert check_candidate(src) is True
