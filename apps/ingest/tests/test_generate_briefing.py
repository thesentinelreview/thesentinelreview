"""
Unit tests for sentinel.jobs.generate_briefing helpers.

Only the pure/side-effect-free functions are tested here:
  - _notable_shifts()  — per-oblast delta computation
"""
from __future__ import annotations

from sentinel.jobs.generate_briefing import _notable_shifts

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _event(oblast: str) -> dict:
    return {"oblast": oblast, "confidence": "verified"}


def _events(*oblasts: str) -> list[dict]:
    return [_event(o) for o in oblasts]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestNotableShifts:
    def test_no_events_returns_empty(self) -> None:
        assert _notable_shifts([], baseline={}) == []

    def test_no_baseline_emits_no_prior_baseline(self) -> None:
        events = _events("Donetsk", "Donetsk")
        shifts = _notable_shifts(events, baseline={})
        assert len(shifts) == 1
        assert "Donetsk" in shifts[0]
        assert "no prior baseline" in shifts[0]

    def test_spike_above_threshold(self) -> None:
        # 10 events vs baseline of 5/day → +100% → included
        events = _events(*["Donetsk"] * 10)
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert len(shifts) == 1
        assert "up" in shifts[0]
        assert "100%" in shifts[0]

    def test_drop_below_threshold(self) -> None:
        # 1 event vs baseline of 5/day → -80% → included
        events = _events("Donetsk")
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert len(shifts) == 1
        assert "down" in shifts[0]

    def test_within_threshold_excluded(self) -> None:
        # 5 events vs baseline of 5/day → 0% → excluded
        events = _events(*["Donetsk"] * 5)
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert shifts == []

    def test_just_at_20_percent_included(self) -> None:
        # 6 events vs 5/day → +20% → exactly at threshold → included
        events = _events(*["Donetsk"] * 6)
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert len(shifts) == 1

    def test_multiple_oblasts(self) -> None:
        events = (
            _events(*["Donetsk"] * 10)       # spike
            + _events(*["Kharkiv"] * 5)       # flat
            + _events(*["Zaporizhzhia"] * 1)  # drop
        )
        baseline = {"Donetsk": 5.0, "Kharkiv": 5.0, "Zaporizhzhia": 5.0}
        shifts = _notable_shifts(events, baseline=baseline)
        oblasts_mentioned = [s.split(":")[0] for s in shifts]
        assert "Donetsk" in oblasts_mentioned
        assert "Zaporizhzhia" in oblasts_mentioned
        assert "Kharkiv" not in oblasts_mentioned

    def test_oblast_not_in_baseline_reported_as_new(self) -> None:
        events = _events("Sumy")
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert len(shifts) == 1
        assert "Sumy" in shifts[0]
        assert "no prior baseline" in shifts[0]

    def test_shift_string_contains_oblast_name(self) -> None:
        events = _events(*["Luhansk"] * 8)
        shifts = _notable_shifts(events, baseline={"Luhansk": 4.0})
        assert any("Luhansk" in s for s in shifts)

    def test_shift_string_contains_event_count(self) -> None:
        events = _events(*["Donetsk"] * 10)
        shifts = _notable_shifts(events, baseline={"Donetsk": 5.0})
        assert "10 events" in shifts[0]
