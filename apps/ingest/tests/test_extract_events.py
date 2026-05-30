"""
Unit tests for the occurred_at write-time guards in sentinel.jobs.extract_events.

Both helpers are pure and run immediately before dedup and insert:

- _clamp_future_occurred_at guards against the LLM lifting a garbled future
  date verbatim from hostile source text (e.g. a Telegram post that says
  "Thursday, June 7" when the actual day is Thursday, May 28).
- _is_occurred_at_too_old guards the past side: the LLM occasionally lifts a
  commemorative reference ("one year ago today…") and emits an event whose
  occurred_at is far older than the reporting post.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog

from sentinel.jobs.extract_events import (
    _clamp_future_occurred_at,
    _is_occurred_at_too_old,
)


def _utc(year: int, month: int, day: int, hour: int = 12, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


class TestClampFutureOccurredAt:
    def test_far_future_occurred_at_is_clamped_to_posted_at(self) -> None:
        # The Bandar Abbas incident: post was on 28 May, occurred_at was lifted
        # as 7 June (10 days ahead). Clamp must pin it to posted_at and emit a
        # structured warning so the slip is greppable in run logs.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = _utc(2026, 6, 7, 3, 0)
        post_id = uuid.uuid4()

        with structlog.testing.capture_logs() as logs:
            clamped = _clamp_future_occurred_at(
                occurred_at, posted_at=posted_at, post_id=post_id
            )

        assert clamped == posted_at
        warnings = [e for e in logs if e["event"] == "future_occurred_at_clamped"]
        assert len(warnings) == 1
        assert warnings[0]["log_level"] == "warning"
        assert warnings[0]["post_id"] == str(post_id)
        assert warnings[0]["clamped_to"] == posted_at.isoformat()

    def test_occurred_at_within_tolerance_is_untouched(self) -> None:
        # 30 min past posted_at — within the 1h tolerance window, so legitimate
        # clock skew / timezone rounding doesn't trip the clamp.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at + timedelta(minutes=30)

        assert _clamp_future_occurred_at(
            occurred_at, posted_at=posted_at, post_id=uuid.uuid4()
        ) == occurred_at

    def test_occurred_at_in_the_past_is_untouched(self) -> None:
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at - timedelta(hours=6)

        assert _clamp_future_occurred_at(
            occurred_at, posted_at=posted_at, post_id=uuid.uuid4()
        ) == occurred_at

    def test_none_occurred_at_returns_none_without_crashing(self) -> None:
        posted_at = _utc(2026, 5, 28, 22, 0)

        assert _clamp_future_occurred_at(
            None, posted_at=posted_at, post_id=uuid.uuid4()
        ) is None

    def test_none_posted_at_returns_occurred_at_untouched(self) -> None:
        occurred_at = _utc(2026, 6, 7, 3, 0)

        assert _clamp_future_occurred_at(
            occurred_at, posted_at=None, post_id=uuid.uuid4()
        ) == occurred_at


class TestIsOccurredAtTooOld:
    def test_far_past_occurred_at_is_flagged(self) -> None:
        # The commemorative-reference case: post on 28 May reports an event
        # supposedly from a year ago. With a 14-day floor, that's a skip.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = _utc(2025, 5, 28, 12, 0)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=posted_at, floor_days=14
        ) is True

    def test_occurred_at_within_floor_is_not_flagged(self) -> None:
        # 10 days back — within a 14-day floor, so a delayed-reporting piece is
        # preserved.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at - timedelta(days=10)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=posted_at, floor_days=14
        ) is False

    def test_boundary_at_floor_is_inclusive(self) -> None:
        # Exactly floor_days before posted_at → NOT flagged. Boundary inclusive
        # matches the helper's docstring and avoids skipping an event that lands
        # right at the configured edge.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at - timedelta(days=14)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=posted_at, floor_days=14
        ) is False

    def test_one_microsecond_past_floor_is_flagged(self) -> None:
        # One microsecond past the boundary → flagged. Locks in the strict-less-than
        # comparison so a future refactor doesn't silently flip the inequality.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at - timedelta(days=14) - timedelta(microseconds=1)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=posted_at, floor_days=14
        ) is True

    def test_future_occurred_at_is_not_flagged(self) -> None:
        # The past-floor check only fires on the past side. Future timestamps
        # are out of scope here — they're handled by _clamp_future_occurred_at.
        posted_at = _utc(2026, 5, 28, 22, 0)
        occurred_at = posted_at + timedelta(days=30)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=posted_at, floor_days=14
        ) is False

    def test_none_occurred_at_returns_false(self) -> None:
        posted_at = _utc(2026, 5, 28, 22, 0)

        assert _is_occurred_at_too_old(
            None, posted_at=posted_at, floor_days=14
        ) is False

    def test_none_posted_at_returns_false(self) -> None:
        occurred_at = _utc(2025, 5, 28, 12, 0)

        assert _is_occurred_at_too_old(
            occurred_at, posted_at=None, floor_days=14
        ) is False
