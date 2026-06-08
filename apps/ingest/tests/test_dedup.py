"""
Unit tests for sentinel.pipeline.dedup.find_duplicate().

The DB call (find_nearby_events) is patched so no real database is needed. The
time-gap enforcement now lives in find_nearby_events' SQL (a window anchored on the
incoming occurred_at), so these tests assert the correct window is passed down and
that the closest returned candidate is selected — they no longer exercise a Python
gap guard, which has been removed.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from sentinel.config import settings
from sentinel.pipeline.dedup import RADIUS_KM, find_duplicate

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
            occurred_at=_OCC,
            max_gap_hours=settings.dedup_max_time_gap_hours,
            radius_km=RADIUS_KM,
            event_type="strike",
        )

    def test_returns_closest_candidate(self) -> None:
        # find_nearby_events orders by distance, so the caller corroborates the
        # spatially-closest in-window candidate — returned as the full row dict.
        near = _candidate(dist_km=0.5)
        far = _candidate(dist_km=4.9)
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[near, far]):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="clash"
            )

        assert result == near

    def test_returns_single_candidate_as_row_dict(self) -> None:
        candidate = _candidate(dist_km=2.3)
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[candidate]):
            result = find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="movement"
            )

        # The full row is returned (not a bare id) so the caller can instrument the
        # merge with the matched event's occurred_at + distance.
        assert result == candidate
        assert result is not None
        assert result["id"] == candidate["id"]
        assert "occurred_at" in result and "dist_km" in result

    def test_anchors_window_on_incoming_occurred_at(self) -> None:
        # The fix: the dedup window is keyed on the incoming event's occurred_at and
        # the configured ± gap — NOT on now() — so delayed reports still match.
        conn = _mock_conn()
        with patch("sentinel.pipeline.dedup.find_nearby_events", return_value=[]) as mock_fn:
            find_duplicate(
                conn, lng=_LNG, lat=_LAT, occurred_at=_OCC, event_type="movement"
            )

        _, kwargs = mock_fn.call_args
        assert kwargs["event_type"] == "movement"
        assert kwargs["occurred_at"] == _OCC
        assert kwargs["max_gap_hours"] == settings.dedup_max_time_gap_hours
        assert kwargs["radius_km"] == RADIUS_KM

    def test_window_is_kept_tight(self) -> None:
        # Guard the deliberate choice to keep the dedup window narrow (centroid
        # geocoding over-merges on a wide window). 6h or 12h are the sane values.
        assert settings.dedup_max_time_gap_hours <= 12.0
