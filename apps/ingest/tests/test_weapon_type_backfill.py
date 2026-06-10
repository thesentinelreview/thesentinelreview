"""
Unit tests for sentinel.pipeline.weapon_type_backfill.

The DB layer is faked at a fine grain — we feed the iterator a list of fake event
rows and intercept `extract_event`, `log_llm_call`, and `update_event_weapon_type`
to verify the backfill wires them together correctly.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

from sentinel.models import ExtractedEvent


def _event(
    event_id: uuid.UUID | None = None,
    raw_post_id: uuid.UUID | None = None,
    theaters: list[str] | None = None,
) -> dict:
    return {
        "event_id": event_id or uuid.uuid4(),
        "raw_post_id": raw_post_id or uuid.uuid4(),
        "text": "Su-25 carried out an airstrike on the town.",
        "translated_text": None,
        "posted_at": datetime(2026, 5, 1, 12, 0, tzinfo=UTC),
        "display_name": "Clash Report",
        "platform": "telegram",
        "trust_tier": 2,
        "theaters": theaters if theaters is not None else ["ukraine"],
    }


def _meta() -> dict:
    return {
        "model": "claude-sonnet-4-6",
        "prompt": "u",
        "response": '{"has_event":true,"weapon_type":"aircraft"}',
        "prompt_tokens": 10,
        "completion_tokens": 5,
    }


def _fake_conn() -> MagicMock:
    """Stand-in for psycopg.Connection."""
    return MagicMock()


@pytest.fixture(autouse=True)
def _fast_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Don't actually sleep between calls during tests."""
    monkeypatch.setenv("SENTINEL_BACKFILL_RATE_LIMIT", "1000000")


class TestBackfillLoop:
    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._iter_events")
    def test_classified_event_logs_and_persists(
        self,
        mock_iter: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        eid = uuid.uuid4()
        pid = uuid.uuid4()
        mock_iter.return_value = iter([_event(event_id=eid, raw_post_id=pid)])
        mock_extract.return_value = (
            ExtractedEvent(has_event=True, weapon_type="aircraft", description="Su-25 strike"),
            _meta(),
        )

        stats = run_backfill(conn=_fake_conn(), dry_run=False)

        assert stats.considered == 1
        assert stats.classified == 1
        assert stats.null == 0
        assert stats.no_event == 0
        assert stats.failed == 0
        assert stats.dist["aircraft"] == 1

        mock_log.assert_called_once()
        log_kwargs = mock_log.call_args.kwargs
        assert log_kwargs["purpose"] == "weapon_type_backfill"
        assert log_kwargs["job_id"] is None
        assert log_kwargs["raw_post_id"] == pid

        mock_update.assert_called_once()
        upd_kwargs = mock_update.call_args.kwargs
        assert upd_kwargs["weapon_type"] == "aircraft"
        assert mock_update.call_args.args[1] == eid

    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._iter_events")
    def test_event_with_no_weapon_logs_but_does_not_update(
        self,
        mock_iter: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        mock_iter.return_value = iter([_event()])
        mock_extract.return_value = (
            ExtractedEvent(has_event=True, weapon_type=None, description="troop movement"),
            _meta(),
        )

        stats = run_backfill(conn=_fake_conn(), dry_run=False)

        assert stats.considered == 1
        assert stats.classified == 0
        assert stats.null == 1
        mock_log.assert_called_once()       # audit log still written
        mock_update.assert_not_called()     # nothing to persist

    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._iter_events")
    def test_no_event_logs_but_does_not_update(
        self,
        mock_iter: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        mock_iter.return_value = iter([_event()])
        mock_extract.return_value = (ExtractedEvent(has_event=False), _meta())

        stats = run_backfill(conn=_fake_conn(), dry_run=False)

        assert stats.considered == 1
        assert stats.no_event == 1
        assert stats.classified == 0
        assert stats.null == 0
        mock_log.assert_called_once()
        mock_update.assert_not_called()

    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._iter_events")
    def test_extract_exception_marked_failed_not_raised(
        self,
        mock_iter: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        mock_iter.return_value = iter([_event(), _event()])
        mock_extract.side_effect = [
            RuntimeError("api boom"),
            (ExtractedEvent(has_event=True, weapon_type="drone"), _meta()),
        ]

        stats = run_backfill(conn=_fake_conn(), dry_run=False)

        # One exception, one success — backfill keeps going.
        assert stats.considered == 2
        assert stats.failed == 1
        assert stats.classified == 1
        assert mock_update.call_count == 1
        assert mock_log.call_count == 1     # no log for the failed extract


class TestDryRun:
    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._iter_events")
    def test_dry_run_classifies_but_makes_no_writes(
        self,
        mock_iter: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        conn = _fake_conn()
        mock_iter.return_value = iter([_event(), _event()])
        mock_extract.return_value = (
            ExtractedEvent(has_event=True, weapon_type="aircraft"),
            _meta(),
        )

        stats = run_backfill(conn=conn, dry_run=True)

        # Classification still tallied so the operator can preview the outcome...
        assert stats.considered == 2
        assert stats.classified == 2
        assert stats.dist["aircraft"] == 2
        assert stats.dry_run is True
        # ...but NOTHING is written: no UPDATE, no audit log, no commit.
        mock_update.assert_not_called()
        mock_log.assert_not_called()
        conn.commit.assert_not_called()


class TestMaxEventsCap:
    @patch("sentinel.pipeline.weapon_type_backfill.update_event_weapon_type")
    @patch("sentinel.pipeline.weapon_type_backfill.log_llm_call")
    @patch("sentinel.pipeline.weapon_type_backfill.extract_event")
    @patch("sentinel.pipeline.weapon_type_backfill._fetch_batch")
    def test_max_events_caps_iteration(
        self,
        mock_fetch: MagicMock,
        mock_extract: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import run_backfill

        monkeypatch.setenv("SENTINEL_BACKFILL_MAX_EVENTS", "2")
        # Fetch returns 5 rows but the iterator caps at 2.
        mock_fetch.return_value = [_event() for _ in range(5)]
        mock_extract.return_value = (
            ExtractedEvent(has_event=True, weapon_type="artillery"),
            _meta(),
        )

        stats = run_backfill(conn=_fake_conn(), dry_run=False)

        assert stats.considered == 2
        assert mock_extract.call_count == 2


class TestConfig:
    def test_safe_defaults(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A bare run must default to a capped dry-run."""
        from sentinel.pipeline.weapon_type_backfill import _config

        monkeypatch.delenv("SENTINEL_BACKFILL_DRYRUN", raising=False)
        monkeypatch.delenv("SENTINEL_BACKFILL_MAX_EVENTS", raising=False)

        cfg = _config()
        assert cfg["dry_run"] is True
        assert cfg["max_events"] == 50

    @pytest.mark.parametrize(
        "value,expected",
        [("false", False), ("0", False), ("no", False),
         ("true", True), ("1", True), ("yes", True)],
    )
    def test_dryrun_env_parsing(
        self, monkeypatch: pytest.MonkeyPatch, value: str, expected: bool
    ) -> None:
        from sentinel.pipeline.weapon_type_backfill import _config

        monkeypatch.setenv("SENTINEL_BACKFILL_DRYRUN", value)
        assert _config()["dry_run"] is expected


class TestPickTheater:
    @pytest.mark.parametrize(
        "theaters,expected",
        [
            (["sudan", "iran"], "iran"),     # first match in THEATERS order wins
            (["myanmar"], "myanmar"),
            (["sudan"], "sudan"),
            ([], "unknown"),                 # no theater -> generic 'unknown' (NOT ukraine)
            (None, "unknown"),               # no theater -> generic 'unknown' (NOT ukraine)
            (["atlantis"], "unknown"),       # unrecognised -> generic 'unknown'
        ],
    )
    def test_pick_theater(self, theaters: list[str] | None, expected: str) -> None:
        from sentinel.pipeline.weapon_type_backfill import _pick_theater

        assert _pick_theater(theaters) == expected
