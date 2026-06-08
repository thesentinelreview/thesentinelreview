"""
Unit tests for sentinel.jobs.extract_events._maybe_upgrade_confidence — the
corroboration re-score.

Post-fix it persists the corroborating post's strong signal (OR-in) and recomputes
confidence deterministically from the event's CURRENT sources + persisted
has_strong_signal, so an event whose first source lacked a signal can reach
`verified` once a cross-platform source carrying one attaches. conn is mocked.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from sentinel.jobs.extract_events import _maybe_upgrade_confidence


def _conn_returning(row: dict | None) -> MagicMock:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = row
    return conn


def _row(
    *,
    confidence: str,
    has_strong_signal: bool,
    source_count: int,
    platform_count: int,
    min_trust_tier: int = 2,
) -> dict:
    return {
        "confidence": confidence,
        "has_strong_signal": has_strong_signal,
        "source_count": source_count,
        "platform_count": platform_count,
        "min_trust_tier": min_trust_tier,
    }


def _confidence_updates(conn: MagicMock) -> list:
    return [c for c in conn.execute.call_args_list if "SET confidence" in c.args[0]]


def _signal_updates(conn: MagicMock) -> list:
    return [c for c in conn.execute.call_args_list if "has_strong_signal = true" in c.args[0]]


class TestMaybeUpgradeConfidence:
    def test_persisted_strong_signal_reaches_verified(self) -> None:
        # 2 sources / 2 platforms with a persisted strong signal -> verified.
        conn = _conn_returning(
            _row(confidence="unconfirmed", has_strong_signal=True, source_count=2, platform_count=2)
        )
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=False)

        updates = _confidence_updates(conn)
        assert len(updates) == 1
        assert updates[0].args[1][0] == "verified"

    def test_no_strong_signal_caps_at_partial(self) -> None:
        # Same structure, no strong signal -> partial, never verified (regression guard).
        conn = _conn_returning(
            _row(
                confidence="unconfirmed", has_strong_signal=False, source_count=2, platform_count=2
            )
        )
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=False)

        updates = _confidence_updates(conn)
        assert len(updates) == 1
        assert updates[0].args[1][0] == "partial"

    def test_incoming_signal_is_or_merged_then_promotes(self) -> None:
        # The corroborating post carries a strong signal: the flag is OR'd to true
        # (the SELECT then sees it) and the event reaches verified.
        conn = _conn_returning(
            _row(confidence="unconfirmed", has_strong_signal=True, source_count=2, platform_count=2)
        )
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=True)

        assert len(_signal_updates(conn)) == 1
        assert _confidence_updates(conn)[0].args[1][0] == "verified"

    def test_no_signal_write_when_incoming_is_false(self) -> None:
        conn = _conn_returning(
            _row(confidence="partial", has_strong_signal=True, source_count=2, platform_count=2)
        )
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=False)
        assert _signal_updates(conn) == []

    def test_noop_when_event_missing(self) -> None:
        conn = _conn_returning(None)
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=False)
        assert _confidence_updates(conn) == []

    def test_idempotent_no_update_when_unchanged(self) -> None:
        conn = _conn_returning(
            _row(confidence="verified", has_strong_signal=True, source_count=2, platform_count=2)
        )
        _maybe_upgrade_confidence(conn, event_id=uuid.uuid4(), incoming_strong_signal=False)
        assert _confidence_updates(conn) == []
