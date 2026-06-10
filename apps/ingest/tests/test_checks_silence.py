"""Pure-logic tests for the source-silence classifier (no Postgres).

The 72h silent-sources alarm was reshaped into a TRANSITION alert: a source is
'newly_silent' only while it has just crossed the 14-day health boundary, so a
chronically-silent feed stops warning every run. 'never_posted' is its own
informational cluster. These tests pin the bucketing without a DB.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sentinel.checks import _silence_state

_NOW = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)


def test_never_posted() -> None:
    assert _silence_state(None, _NOW) == "never_posted"


def test_healthy_within_14d() -> None:
    assert _silence_state(_NOW - timedelta(days=1), _NOW) == "healthy"
    assert _silence_state(_NOW - timedelta(days=13, hours=23), _NOW) == "healthy"


def test_newly_silent_just_past_boundary() -> None:
    # Crossed the 14-day threshold within the last ~day → transition window.
    assert _silence_state(_NOW - timedelta(days=14, hours=1), _NOW) == "newly_silent"
    assert _silence_state(_NOW - timedelta(days=14, hours=23), _NOW) == "newly_silent"


def test_chronically_silent_no_longer_warns() -> None:
    # Well past the transition band — these used to spam the 72h warning every run.
    assert _silence_state(_NOW - timedelta(days=30), _NOW) == "chronically_silent"
    assert _silence_state(_NOW - timedelta(days=200), _NOW) == "chronically_silent"
