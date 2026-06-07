"""
Unit tests for sentinel.ingestors.x.

Regression guard for the X ingestor's fetch-health stamping: without
self.last_fetch_meta set, db._classify_fetch falls through to the
meta=None branch (always silent, last_post_at NULL). When @IrrawaddyNews
captured a post on 2026-05-30, last_post_at stayed NULL and the source
was marked silent. Mirrors the GDELT fix in PR #174.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import httpx

from sentinel.db import _classify_fetch
from sentinel.ingestors.x import XIngestor


def _tweet(tweet_id: str, created_at: str, text: str = "test tweet") -> dict:
    """Build a synthetic X API v2 tweet payload."""
    return {
        "id": tweet_id,
        "created_at": created_at,
        "text": text,
        "lang": "en",
    }


def _mock_client_with_response(payload: dict) -> MagicMock:
    """Build a MagicMock httpx.Client whose context-manager .get() returns a
    response yielding `payload` from .json() and 200 status."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None

    client = MagicMock()
    client.get.return_value = resp

    # The fetch() uses `with httpx.Client(timeout=30) as client:` so the
    # MagicMock returned from httpx.Client(...) must support __enter__/__exit__.
    ctx = MagicMock()
    ctx.__enter__.return_value = client
    ctx.__exit__.return_value = False
    return ctx


def _make_source(handle: str = "IrrawaddyNews") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "handle": handle,
        "platform": "x",
        "display_name": handle,
        "trust_tier": 2,
    }


# ---------------------------------------------------------------------------
# Fetch-health stamping: X ingestor must populate last_fetch_meta so the
# centralized record_source_fetch sets health_status/last_post_at correctly,
# instead of falling through the meta=None path (always silent, last_post_at NULL).
# ---------------------------------------------------------------------------

class TestXHealthMeta:
    def test_captured_tweets_set_meta_and_classify_healthy(self) -> None:
        # Two tweets at distinct created_at (12:00Z and 13:00Z).
        payload = {
            "data": [
                _tweet("1", "2026-05-30T12:00:00Z", "tweet one"),
                _tweet("2", "2026-05-30T13:00:00Z", "tweet two"),
            ],
            "meta": {},  # no next_token -> pagination loop exits cleanly
        }
        ingestor = XIngestor(_make_source())
        with patch("sentinel.ingestors.x.settings") as mock_settings, \
             patch("sentinel.ingestors.x.httpx.Client",
                   return_value=_mock_client_with_response(payload)):
            mock_settings.x_enabled = True
            mock_settings.x_bearer_token = "fake-token"
            results = ingestor.fetch(since_hours=24)

        assert len(results) == 2
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["transport_error"] is None
        # For X a "result" is a captured tweet, so raw_entries == results.
        assert meta["results"] == 2
        assert meta["raw_entries"] == 2
        # newest_posted_at keys on each post's posted_at: max(12:00, 13:00).
        assert meta["newest_posted_at"] == datetime(
            2026, 5, 30, 13, 0, 0, tzinfo=UTC
        )
        # raw_entries == results (>0) must classify healthy (not the "0 ingestable"
        # branch) and surface the newest timestamp for last_post_at. posts_inserted=0
        # simulates an all-deduped cycle — the exact case that used to read silent.
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, is_error) == ("healthy", False)
        assert newest == datetime(2026, 5, 30, 13, 0, 0, tzinfo=UTC)

    def test_no_tweets_set_meta_and_classify_silent(self) -> None:
        # Empty data array -> 0 captured tweets.
        payload = {"data": [], "meta": {}}
        ingestor = XIngestor(_make_source())
        with patch("sentinel.ingestors.x.settings") as mock_settings, \
             patch("sentinel.ingestors.x.httpx.Client",
                   return_value=_mock_client_with_response(payload)):
            mock_settings.x_enabled = True
            mock_settings.x_bearer_token = "fake-token"
            results = ingestor.fetch(since_hours=24)

        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["results"] == 0
        assert meta["raw_entries"] == 0
        assert meta["newest_posted_at"] is None
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, newest, is_error) == ("silent", None, False)

    def test_transport_error_sets_transport_error(self) -> None:
        # httpx.HTTPError during fetch should land in meta["transport_error"]
        # and classify as is_error=True (not a false silent).
        client = MagicMock()
        client.get.side_effect = httpx.HTTPError("boom")
        ctx = MagicMock()
        ctx.__enter__.return_value = client
        ctx.__exit__.return_value = False

        ingestor = XIngestor(_make_source())
        with patch("sentinel.ingestors.x.settings") as mock_settings, \
             patch("sentinel.ingestors.x.httpx.Client", return_value=ctx):
            mock_settings.x_enabled = True
            mock_settings.x_bearer_token = "fake-token"
            results = ingestor.fetch(since_hours=24)

        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert "boom" in (meta["transport_error"] or "")
        # A transport failure classifies as an error, not a false silent.
        _health, _detail, _newest, is_error = _classify_fetch(0, meta)
        assert is_error is True

    def test_disabled_sets_meta_with_zero_results(self) -> None:
        # When x_enabled is False, fetch() must still set last_fetch_meta so
        # downstream health stamping sees a meta dict, not None.
        ingestor = XIngestor(_make_source())
        with patch("sentinel.ingestors.x.settings") as mock_settings:
            mock_settings.x_enabled = False
            results = ingestor.fetch(since_hours=24)

        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["results"] == 0
        assert meta["raw_entries"] == 0
        assert meta["transport_error"] is None
        assert meta["newest_posted_at"] is None
