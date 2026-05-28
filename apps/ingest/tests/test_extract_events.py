"""
Unit tests for the future-occurred_at clamp in sentinel.jobs.extract_events.

The clamp is a pure helper guarding against the LLM lifting a garbled future
date verbatim from hostile source text (e.g. a Telegram post that says
"Thursday, June 7" when the actual day is Thursday, May 28). It runs at write
time, immediately before dedup and insert.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog

from sentinel.jobs.extract_events import _clamp_future_occurred_at


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
