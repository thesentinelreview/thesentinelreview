"""
Unit tests for sentinel.pipeline.confidence_backfill.

Covers the strong-signal recovery rule and _process_one's recompute, with the two
load-bearing safety properties:
  * the backfill NEVER manufactures a `verified` event, and
  * it never demotes a stored `verified` (it skips + reports instead).
conn is mocked; no DB needed.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from sentinel.pipeline.confidence_backfill import (
    BackfillStats,
    _process_one,
    recover_strong_signal,
)


def _row(
    confidence: str,
    source_count: int,
    platform_count: int,
    *,
    min_trust_tier: int = 2,
    has_strong_signal: bool = False,
) -> dict:
    return {
        "event_id": uuid.uuid4(),
        "confidence": confidence,
        "has_strong_signal": has_strong_signal,
        "source_count": source_count,
        "platform_count": platform_count,
        "min_trust_tier": min_trust_tier,
    }


# ---------------------------------------------------------------------------
# recover_strong_signal — exact inverse of classify for multi-source events
# ---------------------------------------------------------------------------

class TestRecoverStrongSignal:
    def test_verified_is_true(self) -> None:
        assert recover_strong_signal(confidence="verified", platform_count=2) is True

    def test_partial_single_platform_is_true(self) -> None:
        assert recover_strong_signal(confidence="partial", platform_count=1) is True

    def test_partial_multi_platform_is_false(self) -> None:
        assert recover_strong_signal(confidence="partial", platform_count=2) is False

    def test_unconfirmed_is_false(self) -> None:
        assert recover_strong_signal(confidence="unconfirmed", platform_count=2) is False


# ---------------------------------------------------------------------------
# _process_one — recompute + write semantics
# ---------------------------------------------------------------------------

class TestProcessOne:
    def test_unconfirmed_cross_platform_promotes_to_partial(self) -> None:
        conn = MagicMock()
        stats = BackfillStats(dry_run=False)
        _process_one(conn, row=_row("unconfirmed", 2, 2), stats=stats, dry_run=False)

        assert stats.updated == 1
        assert stats.transitions["unconfirmed->partial"] == 1
        sql, params = conn.execute.call_args.args
        assert "UPDATE events SET confidence" in sql
        assert params[0] == "partial"
        assert params[1] is False  # recovered has_strong_signal

    def test_same_platform_unconfirmed_stays_unconfirmed(self) -> None:
        conn = MagicMock()
        stats = BackfillStats(dry_run=False)
        _process_one(conn, row=_row("unconfirmed", 2, 1), stats=stats, dry_run=False)

        assert stats.unchanged == 1
        conn.execute.assert_not_called()

    def test_verified_with_one_source_is_skipped_not_demoted(self) -> None:
        conn = MagicMock()
        stats = BackfillStats(dry_run=False)
        _process_one(conn, row=_row("verified", 1, 1, min_trust_tier=2), stats=stats, dry_run=False)

        assert stats.skipped_demote == 1
        assert stats.updated == 0
        conn.execute.assert_not_called()

    def test_consistent_verified_unchanged_no_write(self) -> None:
        conn = MagicMock()
        stats = BackfillStats(dry_run=False)
        _process_one(
            conn,
            row=_row("verified", 2, 2, has_strong_signal=True),
            stats=stats,
            dry_run=False,
        )

        assert stats.unchanged == 1
        conn.execute.assert_not_called()

    def test_signal_only_when_confidence_same_but_flag_changes(self) -> None:
        # Single-platform partial: confidence stays partial, but the recovered
        # strong-signal flag (true) is persisted so a future source can promote it.
        conn = MagicMock()
        stats = BackfillStats(dry_run=False)
        _process_one(
            conn,
            row=_row("partial", 2, 1, has_strong_signal=False),
            stats=stats,
            dry_run=False,
        )

        assert stats.signal_only == 1
        assert stats.updated == 0
        _, params = conn.execute.call_args.args
        assert params[0] == "partial"   # confidence unchanged
        assert params[1] is True        # flag flipped to recovered value

    def test_dry_run_counts_but_writes_nothing(self) -> None:
        conn = MagicMock()
        stats = BackfillStats(dry_run=True)
        _process_one(conn, row=_row("unconfirmed", 2, 2), stats=stats, dry_run=True)

        assert stats.updated == 1          # counted
        conn.execute.assert_not_called()    # but not written


# ---------------------------------------------------------------------------
# Safety property: the backfill can NEVER manufacture a verified event.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("confidence", ["partial", "unconfirmed"])
@pytest.mark.parametrize("source_count", [1, 2, 3])
@pytest.mark.parametrize("platform_count", [1, 2])
@pytest.mark.parametrize("min_trust_tier", [1, 2, 3])
def test_never_manufactures_verified(
    confidence: str, source_count: int, platform_count: int, min_trust_tier: int
) -> None:
    if platform_count > source_count:
        pytest.skip("platform_count cannot exceed source_count")
    conn = MagicMock()
    stats = BackfillStats(dry_run=True)
    _process_one(
        conn,
        row=_row(confidence, source_count, platform_count, min_trust_tier=min_trust_tier),
        stats=stats,
        dry_run=True,
    )
    assert all(not key.endswith("->verified") for key in stats.transitions)
