"""
Unit tests for sentinel.jobs.extract_events._record_dedup_decision_safe — the
best-effort writer for the dedup_decisions audit trail (migrations 0024 + 0026).

Verifies it computes the merge gap/distance, logs both sides' geocode_precision,
records NULLs for a fresh event, and — critically — never lets an instrumentation
failure abort ingest. conn is mocked.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from sentinel.jobs.extract_events import _record_dedup_decision_safe

_OCC = datetime(2024, 11, 1, 12, 0, tzinfo=timezone.utc)


def test_merge_records_gap_distance_and_precision() -> None:
    conn = MagicMock()
    matched = {"id": uuid.uuid4(), "occurred_at": _OCC, "dist_km": 2.0, "geocode_precision": "city"}
    with patch("sentinel.jobs.extract_events.record_dedup_decision") as rec:
        _record_dedup_decision_safe(
            conn,
            decision="merge",
            event_id=matched["id"],
            occurred_at=_OCC + timedelta(hours=3),
            incoming_precision="city",
            matched=matched,
        )

    rec.assert_called_once()
    kwargs = rec.call_args.kwargs
    assert kwargs["decision"] == "merge"
    assert kwargs["matched_event_id"] == matched["id"]
    assert kwargs["matched_occurred_at"] == _OCC
    assert kwargs["gap_hours"] == 3.0
    assert kwargs["distance_m"] == 2000.0
    assert kwargs["incoming_precision"] == "city"
    assert kwargs["matched_precision"] == "city"


def test_new_records_null_match_fields_and_incoming_precision() -> None:
    conn = MagicMock()
    with patch("sentinel.jobs.extract_events.record_dedup_decision") as rec:
        _record_dedup_decision_safe(
            conn,
            decision="new",
            event_id=uuid.uuid4(),
            occurred_at=_OCC,
            incoming_precision="country",
            matched=None,
        )

    kwargs = rec.call_args.kwargs
    assert kwargs["decision"] == "new"
    assert kwargs["matched_event_id"] is None
    assert kwargs["matched_occurred_at"] is None
    assert kwargs["gap_hours"] is None
    assert kwargs["distance_m"] is None
    # A coarse-incoming 'new' decision logs its precision; matched side stays NULL.
    assert kwargs["incoming_precision"] == "country"
    assert kwargs["matched_precision"] is None


def test_instrumentation_failure_does_not_propagate() -> None:
    # A failed audit insert must not abort the surrounding extract transaction.
    conn = MagicMock()
    conn.transaction.return_value.__exit__.return_value = False  # don't suppress
    with patch(
        "sentinel.jobs.extract_events.record_dedup_decision",
        side_effect=RuntimeError("boom"),
    ):
        _record_dedup_decision_safe(
            conn,
            decision="new",
            event_id=uuid.uuid4(),
            occurred_at=_OCC,
            incoming_precision="city",
            matched=None,
        )  # must not raise
