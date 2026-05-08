"""
Unit tests for sentinel.pipeline.dedup.find_duplicate().

The DB call (find_nearby_events) is patched so no real database is needed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from sentinel.pipeline.dedup import RADIUS_KM, WINDOW_HOURS, find_duplicate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_OCC = datetime(2024, 11, 1, 12, 0, tzinfo=timezone.utc)
_LNG, _LAT = 37.71, 48.07  # Pokrovsk-ish


def _candidate(dist_km: float = 1.0) -> dict:
    return {"id": uuid.uuid4(), "dist_km": dist_km}


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
