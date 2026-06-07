"""
Unit tests for sentinel.ingestors.telegram.TelegramIngestor.

Regression guard for the source-health gap: TelegramIngestor used to return
from fetch() without populating self.last_fetch_meta, so db._classify_fetch
fell into the meta=None branch (always "silent" with NULL last_post_at when
the dedup filter swallowed everything). These tests pin the fix that mirrors
gdelt.py / PR #174: _fetch_meta() is set at every return path.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

from sentinel.db import _classify_fetch
from sentinel.ingestors.base import RawPostData
from sentinel.ingestors.telegram import TelegramIngestor


def _msg(
    *,
    external_id: str = "1",
    posted_at: datetime,
    text: str = "shelling reported near Bakhmut",
) -> RawPostData:
    """A synthetic telegram message shaped like _fetch_channel's RawPostData."""
    return RawPostData(
        external_id=external_id,
        posted_at=posted_at,
        text=text,
        media_urls=[],
        archive_url=f"https://t.me/TestChannel/{external_id}",
        lang=None,
    )


def _fetch_with_messages(messages: list[RawPostData]):
    """Run TelegramIngestor.fetch with telethon stubbed out via _fetch_channel.

    We patch asyncio.run inside the telegram module to short-circuit the
    coroutine: this avoids constructing a real telethon client and keeps the
    test free of any network/auth side effects."""
    ingestor = TelegramIngestor(
        {"handle": "TestChannel", "platform": "telegram", "trust_tier": 2}
    )
    with patch(
        "sentinel.ingestors.telegram.settings"
    ) as mock_settings, patch(
        "sentinel.ingestors.telegram.asyncio.run", return_value=messages
    ):
        # Force the "enabled" branch so the credential-missing return doesn't fire.
        mock_settings.telegram_enabled = True
        mock_settings.telegram_api_id = 12345
        mock_settings.telegram_api_hash = "deadbeef"
        mock_settings.telegram_session = ""
        results = ingestor.fetch(since_hours=24)
    return ingestor, results


# ---------------------------------------------------------------------------
# Fetch-health stamping: TelegramIngestor must populate last_fetch_meta so the
# centralized record_source_fetch sets health_status/last_post_at correctly,
# instead of falling through the meta=None path (always silent, last_post_at NULL).
# ---------------------------------------------------------------------------

class TestTelegramHealthMeta:
    def test_matched_rows_set_meta_and_classify_healthy(self) -> None:
        # Two captured messages with distinct posted_at (12:00 and 13:00).
        t1 = datetime(2026, 5, 30, 12, 0, tzinfo=UTC)
        t2 = datetime(2026, 5, 30, 13, 0, tzinfo=UTC)
        ingestor, results = _fetch_with_messages(
            [_msg(external_id="1", posted_at=t1), _msg(external_id="2", posted_at=t2)]
        )
        assert len(results) == 2
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["transport_error"] is None
        # For telegram a "result" is a captured message, so raw_entries == results.
        assert meta["results"] == 2
        assert meta["raw_entries"] == 2
        # newest_posted_at keys on each post's posted_at: max(12:00, 13:00) == 13:00.
        # Not now() and not ingested_at — the bug masked silent feeds as fresh.
        assert meta["newest_posted_at"] == t2
        # raw_entries == results (>0) must classify healthy (not the "0 ingestable"
        # branch) and surface the newest timestamp for last_post_at. posts_inserted=0
        # simulates an all-deduped cycle — the exact case that used to read silent.
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, is_error) == ("healthy", False)
        assert newest == t2

    def test_no_messages_set_meta_and_classify_silent(self) -> None:
        # Empty channel -> 0 captured messages.
        ingestor, results = _fetch_with_messages([])
        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["results"] == 0
        assert meta["raw_entries"] == 0
        assert meta["newest_posted_at"] is None
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, newest, is_error) == ("silent", None, False)

    def test_fetch_channel_error_sets_transport_error(self) -> None:
        ingestor = TelegramIngestor(
            {"handle": "TestChannel", "platform": "telegram", "trust_tier": 2}
        )
        # asyncio.run propagates whatever the coroutine raises. Patching it to
        # raise directly is equivalent and avoids spinning up a real loop.
        with patch(
            "sentinel.ingestors.telegram.settings"
        ) as mock_settings, patch(
            "sentinel.ingestors.telegram.asyncio.run",
            side_effect=RuntimeError("boom"),
        ):
            mock_settings.telegram_enabled = True
            mock_settings.telegram_api_id = 12345
            mock_settings.telegram_api_hash = "deadbeef"
            mock_settings.telegram_session = ""
            results = ingestor.fetch(since_hours=24)
        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert "boom" in (meta["transport_error"] or "")
        # A transport failure classifies as an error, not a false silent.
        _health, _detail, _newest, is_error = _classify_fetch(0, meta)
        assert is_error is True

    def test_disabled_credentials_set_meta_not_none(self) -> None:
        # When TELEGRAM_API_ID/HASH are unset, fetch() short-circuits. It must
        # still leave a meta dict (results=0) — not None — so the consumer
        # doesn't fall into the legacy meta=None silent-stamp path.
        ingestor = TelegramIngestor(
            {"handle": "TestChannel", "platform": "telegram", "trust_tier": 2}
        )
        with patch("sentinel.ingestors.telegram.settings") as mock_settings:
            mock_settings.telegram_enabled = False
            results = ingestor.fetch(since_hours=24)
        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["results"] == 0
        assert meta["raw_entries"] == 0
        assert meta["transport_error"] is None
        assert meta["newest_posted_at"] is None
