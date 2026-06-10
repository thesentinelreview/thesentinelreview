"""Pure-logic tests for the per-source error-backoff window (no Postgres).

A repeatedly-failing source is skipped for a capped, exponentially growing
window so a dead/403 feed isn't re-hammered every 30 min. Derived purely from
consecutive_errors + last_error_at — these tests prove the math without a DB.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sentinel.scheduler import (
    _BACKOFF_BASE_MINUTES,
    _BACKOFF_CAP_MINUTES,
    _BACKOFF_FLOOR_ERRORS,
    _backoff_window,
    _should_skip_for_backoff,
)

_NOW = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)


def test_no_backoff_below_floor() -> None:
    for n in range(_BACKOFF_FLOOR_ERRORS):
        assert _backoff_window(n) == timedelta(0)


def test_window_grows_exponentially_from_floor() -> None:
    base = _BACKOFF_BASE_MINUTES
    assert _backoff_window(_BACKOFF_FLOOR_ERRORS) == timedelta(minutes=base)
    assert _backoff_window(_BACKOFF_FLOOR_ERRORS + 1) == timedelta(minutes=base * 2)
    assert _backoff_window(_BACKOFF_FLOOR_ERRORS + 2) == timedelta(minutes=base * 4)


def test_window_is_capped() -> None:
    assert _backoff_window(100) == timedelta(minutes=_BACKOFF_CAP_MINUTES)


def test_streak_below_floor_never_skips() -> None:
    assert _should_skip_for_backoff(_BACKOFF_FLOOR_ERRORS - 1, _NOW, _NOW) is False


def test_skip_inside_window() -> None:
    # floor streak → base-minute window; last attempt well inside it.
    last = _NOW - timedelta(minutes=_BACKOFF_BASE_MINUTES // 3)
    assert _should_skip_for_backoff(_BACKOFF_FLOOR_ERRORS, last, _NOW) is True


def test_no_skip_past_window() -> None:
    # floor streak → base-minute window; last attempt just past it → eligible.
    last = _NOW - timedelta(minutes=_BACKOFF_BASE_MINUTES + 1)
    assert _should_skip_for_backoff(_BACKOFF_FLOOR_ERRORS, last, _NOW) is False


def test_no_skip_when_last_attempt_unknown() -> None:
    assert _should_skip_for_backoff(99, None, _NOW) is False
