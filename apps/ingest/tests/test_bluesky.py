"""
Unit tests for sentinel.ingestors.bluesky.

Covers:
  - _extract_media_urls()      — image, external thumb, video, empty
  - BlueskyIngestor.fetch()    — happy path, repost skipping, pagination,
                                  cutoff filtering, client error, parse error
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sentinel.db import _classify_fetch
from sentinel.ingestors.bluesky import BlueskyIngestor, _extract_media_urls, _fetch_meta


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(tz=timezone.utc)
_RECENT = _NOW - timedelta(hours=1)
_OLD = _NOW - timedelta(hours=48)


def _make_source(handle: str = "test.bsky.social") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "handle": handle,
        "platform": "bluesky",
        "display_name": "Test Account",
        "trust_tier": 2,
    }


def _make_post(
    uri: str = "at://did:plc:abc/app.bsky.feed.post/abc123",
    text: str = "Test post",
    created_at: datetime = _RECENT,
    langs: list[str] | None = None,
    embed: object = None,
) -> SimpleNamespace:
    record = SimpleNamespace(
        text=text,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
        langs=langs,
    )
    return SimpleNamespace(uri=uri, record=record, embed=embed)


def _make_feed_item(post: SimpleNamespace, reason: object = None) -> SimpleNamespace:
    return SimpleNamespace(post=post, reason=reason)


def _make_feed(items: list, cursor: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(feed=items, cursor=cursor)


# ---------------------------------------------------------------------------
# _extract_media_urls
# ---------------------------------------------------------------------------

class TestExtractMediaUrls:
    def test_returns_empty_when_no_embed(self) -> None:
        post = SimpleNamespace(embed=None)
        assert _extract_media_urls(post) == []

    def test_returns_empty_when_embed_has_no_known_fields(self) -> None:
        post = SimpleNamespace(embed=SimpleNamespace())
        assert _extract_media_urls(post) == []

    def test_extracts_image_fullsize_urls(self) -> None:
        img1 = SimpleNamespace(fullsize="https://cdn.bsky.app/img/feed_fullsize/plain/img1")
        img2 = SimpleNamespace(fullsize="https://cdn.bsky.app/img/feed_fullsize/plain/img2")
        embed = SimpleNamespace(images=[img1, img2], external=None, playlist=None)
        post = SimpleNamespace(embed=embed)
        result = _extract_media_urls(post)
        assert result == [
            "https://cdn.bsky.app/img/feed_fullsize/plain/img1",
            "https://cdn.bsky.app/img/feed_fullsize/plain/img2",
        ]

    def test_extracts_external_thumb(self) -> None:
        external = SimpleNamespace(thumb="https://cdn.bsky.app/img/feed_thumbnail/plain/thumb")
        embed = SimpleNamespace(images=None, external=external, playlist=None)
        post = SimpleNamespace(embed=embed)
        result = _extract_media_urls(post)
        assert result == ["https://cdn.bsky.app/img/feed_thumbnail/plain/thumb"]

    def test_extracts_video_playlist(self) -> None:
        embed = SimpleNamespace(images=None, external=None, playlist="https://video.bsky.app/hls/playlist.m3u8")
        post = SimpleNamespace(embed=embed)
        result = _extract_media_urls(post)
        assert result == ["https://video.bsky.app/hls/playlist.m3u8"]

    def test_skips_image_without_fullsize(self) -> None:
        img = SimpleNamespace(fullsize=None)
        embed = SimpleNamespace(images=[img], external=None, playlist=None)
        post = SimpleNamespace(embed=embed)
        assert _extract_media_urls(post) == []


# ---------------------------------------------------------------------------
# BlueskyIngestor.fetch()
# ---------------------------------------------------------------------------

class TestBlueskyIngestorFetch:
    def _make_ingestor(self, handle: str = "test.bsky.social") -> BlueskyIngestor:
        return BlueskyIngestor(_make_source(handle))

    def _patch_client(self, feed_pages: list) -> MagicMock:
        """Return a mock client whose get_author_feed yields pages in sequence."""
        mock_client = MagicMock()
        mock_client.get_author_feed.side_effect = feed_pages
        return mock_client

    def test_returns_empty_when_client_raises(self) -> None:
        ingestor = self._make_ingestor()
        with patch("sentinel.ingestors.bluesky._get_client", side_effect=RuntimeError("no creds")):
            result = ingestor.fetch(since_hours=24)
        assert result == []

    def test_returns_empty_when_feed_empty(self) -> None:
        ingestor = self._make_ingestor()
        mock_client = self._patch_client([_make_feed([])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result == []

    def test_returns_post_within_cutoff(self) -> None:
        ingestor = self._make_ingestor()
        post = _make_post(text="Recent conflict update")
        item = _make_feed_item(post)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert len(result) == 1
        assert result[0]["text"] == "Recent conflict update"

    def test_skips_posts_older_than_cutoff(self) -> None:
        ingestor = self._make_ingestor()
        old_post = _make_post(created_at=_OLD, text="Old post")
        item = _make_feed_item(old_post)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result == []

    def test_skips_reposts(self) -> None:
        ingestor = self._make_ingestor()
        post = _make_post(text="Reposted content")
        repost_reason = SimpleNamespace(by=SimpleNamespace(handle="someone.bsky.social"))
        item = _make_feed_item(post, reason=repost_reason)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result == []

    def test_sets_archive_url_correctly(self) -> None:
        ingestor = self._make_ingestor(handle="user.bsky.social")
        post = _make_post(uri="at://did:plc:abc/app.bsky.feed.post/rkey123")
        item = _make_feed_item(post)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result[0]["archive_url"] == "https://bsky.app/profile/user.bsky.social/post/rkey123"

    def test_sets_lang_from_record(self) -> None:
        ingestor = self._make_ingestor()
        post = _make_post(langs=["uk"])
        item = _make_feed_item(post)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result[0]["lang"] == "uk"

    def test_lang_is_none_when_no_langs(self) -> None:
        ingestor = self._make_ingestor()
        post = _make_post(langs=None)
        item = _make_feed_item(post)
        mock_client = self._patch_client([_make_feed([item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert result[0]["lang"] is None

    def test_paginates_until_cutoff(self) -> None:
        ingestor = self._make_ingestor()

        recent1 = _make_post(uri="at://did/post/1", text="Page 1 post")
        recent2 = _make_post(uri="at://did/post/2", text="Page 2 post")
        old_post = _make_post(uri="at://did/post/3", text="Old post", created_at=_OLD)

        page1 = _make_feed([_make_feed_item(recent1)], cursor="cursor-p2")
        page2 = _make_feed([_make_feed_item(recent2), _make_feed_item(old_post)])

        mock_client = self._patch_client([page1, page2])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)

        assert len(result) == 2
        assert {r["text"] for r in result} == {"Page 1 post", "Page 2 post"}

    def test_stops_when_no_cursor(self) -> None:
        ingestor = self._make_ingestor()
        post = _make_post(text="Only post")
        page = _make_feed([_make_feed_item(post)], cursor=None)
        mock_client = self._patch_client([page])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert mock_client.get_author_feed.call_count == 1

    def test_skips_malformed_post_continues(self) -> None:
        ingestor = self._make_ingestor()
        bad_item = SimpleNamespace(post=SimpleNamespace(record=None), reason=None)
        good_post = _make_post(text="Good post")
        good_item = _make_feed_item(good_post)
        mock_client = self._patch_client([_make_feed([bad_item, good_item])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert len(result) == 1
        assert result[0]["text"] == "Good post"

    def test_fetch_error_mid_page_returns_partial(self) -> None:
        ingestor = self._make_ingestor()
        good_post = _make_post(text="First page post")
        page1 = _make_feed([_make_feed_item(good_post)], cursor="cursor-p2")
        mock_client = self._patch_client([page1, RuntimeError("API error")])
        mock_client.get_author_feed.side_effect = [page1, RuntimeError("API error")]
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            result = ingestor.fetch(since_hours=24)
        assert len(result) == 1


# ---------------------------------------------------------------------------
# Fetch-health stamping: bluesky must populate last_fetch_meta so the
# centralized record_source_fetch sets health_status/last_post_at correctly,
# instead of falling through the meta=None path (always silent, last_post_at NULL).
# ---------------------------------------------------------------------------


class TestBlueskyHealthMeta:
    def _make_ingestor(self, handle: str = "test.bsky.social") -> BlueskyIngestor:
        return BlueskyIngestor(_make_source(handle))

    def _patch_client(self, feed_pages: list) -> MagicMock:
        mock_client = MagicMock()
        mock_client.get_author_feed.side_effect = feed_pages
        return mock_client

    def test_matched_posts_set_meta_and_classify_healthy(self) -> None:
        # Two captured posts with distinct created_at (12:00Z and 13:00Z).
        t1 = datetime(2026, 5, 30, 12, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 5, 30, 13, 0, tzinfo=timezone.utc)
        post1 = _make_post(uri="at://did/post/1", text="Earlier", created_at=t1)
        post2 = _make_post(uri="at://did/post/2", text="Later", created_at=t2)
        ingestor = self._make_ingestor()
        mock_client = self._patch_client(
            [_make_feed([_make_feed_item(post1), _make_feed_item(post2)])]
        )
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            results = ingestor.fetch(since_hours=24 * 365)
        assert len(results) == 2
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["transport_error"] is None
        # For bluesky a "result" is a captured post, so raw_entries == results.
        assert meta["results"] == 2
        assert meta["raw_entries"] == 2
        # newest_posted_at keys on each post's posted_at: max(12:00, 13:00) — NOT now()/ingested_at.
        assert meta["newest_posted_at"] == t2
        # raw_entries == results (>0) must classify healthy and surface the newest
        # timestamp for last_post_at. posts_inserted=0 simulates an all-deduped
        # cycle — the exact case the prior meta=None path masked as silent.
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, is_error) == ("healthy", False)
        assert newest == t2

    def test_client_init_failure_sets_transport_error(self) -> None:
        ingestor = self._make_ingestor()
        with patch(
            "sentinel.ingestors.bluesky._get_client",
            side_effect=RuntimeError("no creds"),
        ):
            results = ingestor.fetch(since_hours=24)
        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert "no creds" in (meta["transport_error"] or "")
        # A client init failure classifies as an error, not a false silent.
        _health, _detail, _newest, is_error = _classify_fetch(0, meta)
        assert is_error is True

    def test_empty_feed_sets_meta_and_classify_silent(self) -> None:
        ingestor = self._make_ingestor()
        mock_client = self._patch_client([_make_feed([])])
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            results = ingestor.fetch(since_hours=24)
        assert results == []
        meta = ingestor.last_fetch_meta
        assert meta is not None
        assert meta["transport_error"] is None
        assert meta["results"] == 0
        assert meta["raw_entries"] == 0
        assert meta["newest_posted_at"] is None
        health, _detail, newest, is_error = _classify_fetch(0, meta)
        assert (health, newest, is_error) == ("silent", None, False)

    def test_mid_page_error_with_first_page_records_transport_error(self) -> None:
        # First-page success then per-page raise: the 1 collected result is still
        # kept (it ingests), but the mid-pagination break MUST record
        # transport_error so the fetch classifies as erroring — partial honesty.
        # A clean stamp here would zero the error streak and fake a healthy feed.
        t1 = datetime(2026, 5, 30, 12, 0, tzinfo=timezone.utc)
        good_post = _make_post(uri="at://did/post/1", text="First page", created_at=t1)
        page1 = _make_feed([_make_feed_item(good_post)], cursor="cursor-p2")
        ingestor = self._make_ingestor()
        mock_client = MagicMock()
        mock_client.get_author_feed.side_effect = [page1, RuntimeError("API error")]
        with patch("sentinel.ingestors.bluesky._get_client", return_value=mock_client):
            results = ingestor.fetch(since_hours=24 * 365)
        # Collected posts are still returned/ingested.
        assert len(results) == 1
        meta = ingestor.last_fetch_meta
        assert meta is not None
        # ...but the abnormal termination is recorded, even with results present.
        assert "API error" in (meta["transport_error"] or "")
        assert meta["results"] == 1
        assert meta["raw_entries"] == 1
        # No HTTP status on a bare client exception → classifies url_broken, and
        # critically is_error=True so the streak increments instead of zeroing.
        _health, _detail, _newest, is_error = _classify_fetch(1, meta)
        assert is_error is True
