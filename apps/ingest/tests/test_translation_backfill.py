"""
Unit tests for sentinel.pipeline.translation_backfill.

The DB layer is mocked at a fine grain — we feed the iterator a list of fake
rows and intercept `translate_post`, `log_llm_call`, and `update_post_translation`
to verify the backfill wires them together correctly.
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from sentinel.models import TranslationResult


def _post(pid: uuid.UUID | None = None, source_id: uuid.UUID | None = None) -> dict:
    return {
        "id": pid or uuid.uuid4(),
        "source_id": source_id or uuid.uuid4(),
        "text": "Привет всем",
    }


def _source(sid: uuid.UUID) -> dict:
    return {
        "id": sid,
        "handle": "DefMon3",
        "platform": "telegram",
        "display_name": "DefMon3",
        "trust_tier": 2,
    }


def _fake_conn() -> MagicMock:
    """Stand-in for psycopg.Connection."""
    return MagicMock()


@pytest.fixture(autouse=True)
def _fast_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """Don't actually sleep between calls during tests."""
    monkeypatch.setenv("SENTINEL_BACKFILL_RATE_LIMIT", "1000000")


class TestBackfillLoop:
    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_translated_post_logs_and_persists(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        pid = uuid.uuid4()
        mock_iter.return_value = iter([{"id": pid, "source_id": sid, "text": "Привет"}])
        mock_get_source.return_value = _source(sid)
        mock_translate.return_value = (
            TranslationResult(language="ru", translation="Hello"),
            {
                "model": "claude-haiku-4-5",
                "prompt": "u",
                "response": '{"language":"ru","translation":"Hello"}',
                "prompt_tokens": 10,
                "completion_tokens": 5,
            },
        )

        stats = run_backfill(conn=_fake_conn())

        assert stats.considered == 1
        assert stats.translated == 1
        assert stats.skipped == 0
        assert stats.failed == 0
        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["purpose"] == "translate_raw_post"
        assert kwargs["job_id"] is None
        assert kwargs["raw_post_id"] == pid
        mock_update.assert_called_once()
        upd_kwargs = mock_update.call_args.kwargs
        assert upd_kwargs["language"] == "ru"
        assert upd_kwargs["translated_text"] == "Hello"

    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_prefilter_skip_writes_no_log(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        mock_iter.return_value = iter([{"id": uuid.uuid4(), "source_id": sid, "text": "https://t.me/x/1"}])
        mock_get_source.return_value = _source(sid)
        # llm_meta is None → pre-filter skipped, no API call.
        mock_translate.return_value = (
            TranslationResult(skipped=True, skip_reason="link_only"),
            None,
        )

        stats = run_backfill(conn=_fake_conn())

        assert stats.considered == 1
        assert stats.translated == 0
        assert stats.skipped == 1
        assert stats.failed == 0
        mock_log.assert_not_called()
        mock_update.assert_called_once()

    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_api_called_but_translation_null_counts_failed(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        mock_iter.return_value = iter([{"id": uuid.uuid4(), "source_id": sid, "text": "..."}])
        mock_get_source.return_value = _source(sid)
        # API was called (llm_meta present) but JSON parse failed → translation=None.
        mock_translate.return_value = (
            TranslationResult(language=None, translation=None),
            {
                "model": "claude-haiku-4-5",
                "prompt": "u",
                "response": "garbage",
                "prompt_tokens": 1,
                "completion_tokens": 1,
            },
        )

        stats = run_backfill(conn=_fake_conn())

        assert stats.failed == 1
        assert stats.translated == 0
        mock_log.assert_called_once()  # audit log still written
        mock_update.assert_called_once()

    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_translate_post_exception_marked_failed_not_raised(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        mock_iter.return_value = iter([
            {"id": uuid.uuid4(), "source_id": sid, "text": "a"},
            {"id": uuid.uuid4(), "source_id": sid, "text": "b"},
        ])
        mock_get_source.return_value = _source(sid)
        mock_translate.side_effect = [
            RuntimeError("api boom"),
            (TranslationResult(language="ru", translation="ok"), {
                "model": "m", "prompt": "p", "response": "r",
                "prompt_tokens": 1, "completion_tokens": 1,
            }),
        ]

        stats = run_backfill(conn=_fake_conn())

        # One exception, one success — backfill keeps going.
        assert stats.considered == 2
        assert stats.failed == 1
        assert stats.translated == 1

    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_source_cache_avoids_repeated_lookup(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        mock_iter.return_value = iter([
            {"id": uuid.uuid4(), "source_id": sid, "text": "a"},
            {"id": uuid.uuid4(), "source_id": sid, "text": "b"},
            {"id": uuid.uuid4(), "source_id": sid, "text": "c"},
        ])
        mock_get_source.return_value = _source(sid)
        mock_translate.return_value = (
            TranslationResult(language="ru", translation="ok"),
            {"model": "m", "prompt": "p", "response": "r",
             "prompt_tokens": 1, "completion_tokens": 1},
        )

        run_backfill(conn=_fake_conn())

        # Same source_id three times → _get_source called once.
        assert mock_get_source.call_count == 1

    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._iter_posts")
    def test_missing_source_marks_failed(
        self,
        mock_iter: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        sid = uuid.uuid4()
        mock_iter.return_value = iter([{"id": uuid.uuid4(), "source_id": sid, "text": "a"}])
        mock_get_source.return_value = None

        stats = run_backfill(conn=_fake_conn())

        assert stats.considered == 1
        assert stats.failed == 1
        mock_translate.assert_not_called()
        mock_update.assert_not_called()


class TestMaxPostsCap:
    @patch("sentinel.pipeline.translation_backfill.update_post_translation")
    @patch("sentinel.pipeline.translation_backfill.log_llm_call")
    @patch("sentinel.pipeline.translation_backfill.translate_post")
    @patch("sentinel.pipeline.translation_backfill._get_source")
    @patch("sentinel.pipeline.translation_backfill._fetch_batch")
    def test_max_posts_caps_iteration(
        self,
        mock_fetch: MagicMock,
        mock_get_source: MagicMock,
        mock_translate: MagicMock,
        mock_log: MagicMock,
        mock_update: MagicMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from sentinel.pipeline.translation_backfill import run_backfill

        monkeypatch.setenv("SENTINEL_BACKFILL_MAX_POSTS", "2")
        sid = uuid.uuid4()
        # Fetch returns 5 rows but the iterator caps at 2.
        mock_fetch.return_value = [
            {"id": uuid.uuid4(), "source_id": sid, "text": str(i)} for i in range(5)
        ]
        mock_get_source.return_value = _source(sid)
        mock_translate.return_value = (
            TranslationResult(language="ru", translation="ok"),
            {"model": "m", "prompt": "p", "response": "r",
             "prompt_tokens": 1, "completion_tokens": 1},
        )

        stats = run_backfill(conn=_fake_conn())

        assert stats.considered == 2
        assert mock_translate.call_count == 2
