"""
Unit tests for sentinel.pipeline.dedup.find_duplicate().

The DB call (find_nearby_events) is patched so no real database is needed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
import structlog

from sentinel.config import settings
from sentinel.pipeline.dedup import RADIUS_KM, WINDOW_HOURS, find_duplicate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_OCC = datetime(2024, 11, 1, 12, 0, tzinfo=timezone.utc)
_LNG, _LAT = 37.71, 48.07  # Pokrovsk-ish


def _candidate(dist_km: float = 1.0, occurred_at: datetime = _OCC) -> dict:
    return {"id": uuid.uuid4(), "dist_km": dist_km, "occurred_at": occurred_at}


def _mock_conn() -> MagicMock:
    return MagicMock()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFindDuplicate:
    def test_returns_none_when_no_candidates(self) -> None:
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[]) as mock_fn:
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
            )

        assert result is None
        mock_fn.assert_called_once_with(
            conn,
            lng=_LNG,
            lat=_LAT,
            radius_km=RADIUS_KM,
            within_hours=WINDOW_HOURS,
            event_type="strike",
        )

    def test_returns_id_of_closest_candidate(self) -> None:
        near = _candidate(dist_km=0.5)
        far = _candidate(dist_km=4.9)
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[near, far]):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="clash"
            )

        assert result == near["id"]

    def test_returns_single_candidate(self) -> None:
        candidate = _candidate(dist_km=2.3)
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="movement"
            )

        assert result == candidate["id"]

    def test_passes_correct_event_type(self) -> None:
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[]) as mock_fn:
            find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="movement"
            )

        _, kwargs = mock_fn.call_args
        assert kwargs["event_type"] == "movement"

    def test_passes_correct_radius_and_window(self) -> None:
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[]) as mock_fn:
            find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
            )

        _, kwargs = mock_fn.call_args
        assert kwargs["radius_km"] == RADIUS_KM
        assert kwargs["within_hours"] == WINDOW_HOURS

    def test_returned_id_is_uuid(self) -> None:
        candidate = _candidate(dist_km=0.1)
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
            )

        assert isinstance(result, uuid.UUID)


class TestTimeGap:
    def test_candidate_within_window_corroborates(self) -> None:
        # 24h apart — inside the 48h default → returns id, no rejection log.
        candidate = _candidate(occurred_at=_OCC - timedelta(hours=24))
        conn = _mock_conn()
        with structlog.testing.capture_logs() as logs:
            with patch(
                "sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]
            ):
                result = find_duplicate(
                    conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
                )

        assert result == candidate["id"]
        assert not any(
            e["event"] == "dedup_candidate_rejected_time_gap" for e in logs
        )

    def test_candidate_outside_window_creates_new_event(self) -> None:
        # The delayed-report bug case: same place/type, but 71h apart in time →
        # do NOT corroborate; the caller will create a fresh event.
        candidate = _candidate(occurred_at=_OCC - timedelta(hours=71))
        conn = _mock_conn()
        with structlog.testing.capture_logs() as logs:
            with patch(
                "sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]
            ):
                result = find_duplicate(
                    conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
                )

        assert result is None
        rejections = [
            e for e in logs if e["event"] == "dedup_candidate_rejected_time_gap"
        ]
        assert len(rejections) == 1
        assert rejections[0]["existing_id"] == str(candidate["id"])
        assert rejections[0]["max_gap_hours"] == settings.dedup_max_time_gap_hours

    def test_boundary_at_window_inclusive(self) -> None:
        # Exactly settings.dedup_max_time_gap_hours apart → still corroborates
        # (≤ inclusive). Use the configured value so a future tweak of the
        # default doesn't silently break this test's intent.
        gap = timedelta(hours=settings.dedup_max_time_gap_hours)
        candidate = _candidate(occurred_at=_OCC - gap)
        conn = _mock_conn()
        with patch(
            "sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]
        ):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
            )

        assert result == candidate["id"]

    def test_first_candidate_too_far_in_time_does_not_fall_through(self) -> None:
        # Documents the no-iteration choice: the spatially-closest candidate is
        # the only one consulted. If its time gap fails, we return None even if
        # a less-close candidate would have fit the window. Matches the user's
        # binary "outside window ⇒ new event" wording in #169.
        near_but_old = _candidate(dist_km=0.5, occurred_at=_OCC - timedelta(hours=72))
        far_but_recent = _candidate(dist_km=4.5, occurred_at=_OCC)
        conn = _mock_conn()
        with patch(
            "sentinel.pipeline.dedup.find_nearby_events",
            return_value=[near_but_old, far_but_recent],
        ):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="strike"
            )

        assert result is None
