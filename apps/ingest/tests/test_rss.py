"""
Unit tests for sentinel.ingestors.rss.

Covers:
  - _parse_date()       — time-struct parsing and attribute fallback order
  - _parse_entry()      — text assembly, external_id derivation, cutoff filtering
  - RSSIngestor.fetch() — happy path + HTTP error path via pytest-httpx
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from sentinel.ingestors.rss import (
    RSSIngestor,
    _cutoff_dt,
    _FetchResult,
    _parse_date,
    _parse_entry,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(tz=timezone.utc)
_RECENT = _NOW - timedelta(hours=1)
_OLD = _NOW - timedelta(hours=48)


def _time_struct(dt: datetime) -> time.struct_time:
    import calendar
    ts = dt.timestamp()
    return time.gmtime(ts)


def _entry(**kwargs: Any) -> SimpleNamespace:
    """Build a minimal feedparser-style entry namespace."""
    defaults: dict[str, Any] = {
        "title": "Test title",
        "summary": "Test summary",
        "id": "https://example.com/article/1",
        "link": "https://example.com/article/1",
        "enclosures": [],
        "published_parsed": _time_struct(_RECENT),
        "updated_parsed": None,
        "created_parsed": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# _parse_date
# ---------------------------------------------------------------------------

class TestParseDate:
    def test_uses_published_parsed(self) -> None:
        entry = _entry(published_parsed=_time_struct(_RECENT))
        result = _parse_date(entry)
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_falls_back_to_updated_parsed(self) -> None:
        entry = _entry(published_parsed=None, updated_parsed=_time_struct(_RECENT))
        result = _parse_date(entry)
        assert result is not None

    def test_falls_back_to_created_parsed(self) -> None:
        entry = _entry(
            published_parsed=None,
            updated_parsed=None,
            created_parsed=_time_struct(_RECENT),
        )
        result = _parse_date(entry)
        assert result is not None

    def test_returns_none_when_all_missing(self) -> None:
        entry = _entry(published_parsed=None, updated_parsed=None, created_parsed=None)
        result = _parse_date(entry)
        assert result is None

    def test_timestamp_is_correct(self) -> None:
        ref = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        entry = _entry(published_parsed=_time_struct(ref))
        result = _parse_date(entry)
        assert result is not None
        assert abs((result - ref).total_seconds()) < 2


# ---------------------------------------------------------------------------
# _parse_entry
# ---------------------------------------------------------------------------

class TestParseEntry:
    # _parse_entry now returns (post, drop_reason); exactly one is non-None.
    def test_returns_none_for_old_entry(self) -> None:
        entry = _entry(published_parsed=_time_struct(_OLD))
        cutoff = _cutoff_dt(since_hours=24)
        post, reason = _parse_entry(entry, cutoff=cutoff)
        assert post is None
        assert reason == "too_old"

    def test_returns_post_for_recent_entry(self) -> None:
        entry = _entry(published_parsed=_time_struct(_RECENT))
        cutoff = _cutoff_dt(since_hours=24)
        post, reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None and reason is None
        assert post["text"] == "Test title\n\nTest summary"

    def test_text_title_only_when_no_summary(self) -> None:
        entry = _entry(summary="")
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        assert post["text"] == "Test title"

    def test_returns_none_when_no_text(self) -> None:
        entry = _entry(title="", summary="")
        cutoff = _cutoff_dt(since_hours=24)
        post, reason = _parse_entry(entry, cutoff=cutoff)
        assert post is None
        assert reason == "no_text"

    def test_external_id_from_entry_id(self) -> None:
        entry = _entry(id="https://example.com/1")
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        assert post["external_id"] == "https://example.com/1"

    def test_external_id_falls_back_to_link(self) -> None:
        entry = _entry(id=None, link="https://example.com/link")
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        assert post["external_id"] == "https://example.com/link"

    def test_external_id_falls_back_to_sha1(self) -> None:
        entry = _entry(id=None, link=None)
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        expected = hashlib.sha1("Test title\n\nTest summary".encode()).hexdigest()
        assert post["external_id"] == expected

    def test_media_urls_from_enclosures(self) -> None:
        enc1 = SimpleNamespace(href="https://cdn.example.com/img1.jpg")
        enc2 = SimpleNamespace(href="https://cdn.example.com/img2.jpg")
        entry = _entry(enclosures=[enc1, enc2])
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        assert post["media_urls"] == [
            "https://cdn.example.com/img1.jpg",
            "https://cdn.example.com/img2.jpg",
        ]

    def test_archive_url_set_to_link(self) -> None:
        entry = _entry(link="https://example.com/story")
        cutoff = _cutoff_dt(since_hours=24)
        post, _reason = _parse_entry(entry, cutoff=cutoff)
        assert post is not None
        assert post["archive_url"] == "https://example.com/story"

    def test_returns_none_when_date_missing(self) -> None:
        entry = _entry(published_parsed=None, updated_parsed=None, created_parsed=None)
        cutoff = _cutoff_dt(since_hours=24)
        post, reason = _parse_entry(entry, cutoff=cutoff)
        assert post is None
        assert reason == "no_date"


# ---------------------------------------------------------------------------
# RSSIngestor.fetch() — mocking httpx.get and feedparser.parse
# ---------------------------------------------------------------------------

_MINIMAL_RSS = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Breaking: test event</title>
      <description>A conflict event occurred near Bakhmut.</description>
      <link>https://example.com/story/1</link>
      <guid>https://example.com/story/1</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>"""


class TestRSSIngestorFetch:
    def _make_ingestor(self, url: str = "https://example.com/feed.xml") -> RSSIngestor:
        source = {
            "id": "00000000-0000-0000-0000-000000000001",
            "handle": "test_feed",
            "platform": "rss",
            "display_name": "Test Feed",
            "url": url,
            "trust_tier": 2,
        }
        return RSSIngestor(source)

    def test_returns_empty_when_no_url(self) -> None:
        source = {"handle": "no_url", "platform": "rss", "url": None, "trust_tier": 2}
        ingestor = RSSIngestor(source)
        results = ingestor.fetch(since_hours=24)
        assert results == []

    def test_returns_empty_on_http_error(self) -> None:
        ingestor = self._make_ingestor()
        # _fetch_feed returns a _FetchResult; content=None signals a transport
        # failure / HTTP >= 400.
        fr = _FetchResult(
            content=None,
            http_status=500,
            content_type="",
            transport_error="HTTP 500",
            final_url="https://example.com/feed.xml",
        )
        with patch("sentinel.ingestors.rss._fetch_feed", return_value=fr):
            results = ingestor.fetch(since_hours=24)
        assert results == []

    def test_returns_posts_from_valid_feed(self) -> None:
        ingestor = self._make_ingestor()
        # Build a feedparser entry with a recent timestamp so it passes the cutoff
        recent_struct = _time_struct(_RECENT)
        fake_entry = SimpleNamespace(
            title="Breaking: test event",
            summary="A conflict event near Bakhmut.",
            id="https://example.com/story/1",
            link="https://example.com/story/1",
            enclosures=[],
            published_parsed=recent_struct,
            updated_parsed=None,
            created_parsed=None,
        )
        fake_feed = SimpleNamespace(entries=[fake_entry])

        fr = _FetchResult(
            content=b"<xml/>",
            http_status=200,
            content_type="application/xml",
            transport_error=None,
            final_url="https://example.com/feed.xml",
        )
        with patch("sentinel.ingestors.rss._fetch_feed", return_value=fr), \
             patch("sentinel.ingestors.rss.feedparser.parse", return_value=fake_feed):
            results = ingestor.fetch(since_hours=24)

        assert len(results) == 1
        assert "Breaking" in results[0]["text"]

    def test_skips_entries_that_raise(self) -> None:
        ingestor = self._make_ingestor()

        # enclosures=42 is not iterable → TypeError inside _parse_entry,
        # which the fetch() loop catches and skips.
        bad_entry = SimpleNamespace(
            title="Bad entry",
            summary="x",
            id=None,
            link=None,
            enclosures=42,
            published_parsed=_time_struct(_RECENT),
            updated_parsed=None,
            created_parsed=None,
        )

        good_entry_struct = _time_struct(_RECENT)
        good_entry = SimpleNamespace(
            title="Good entry",
            summary="ok",
            id="https://example.com/2",
            link="https://example.com/2",
            enclosures=[],
            published_parsed=good_entry_struct,
            updated_parsed=None,
            created_parsed=None,
        )
        fake_feed = SimpleNamespace(entries=[bad_entry, good_entry])

        fr = _FetchResult(
            content=b"<xml/>",
            http_status=200,
            content_type="application/xml",
            transport_error=None,
            final_url="https://example.com/feed.xml",
        )
        with patch("sentinel.ingestors.rss._fetch_feed", return_value=fr), \
             patch("sentinel.ingestors.rss.feedparser.parse", return_value=fake_feed):
            results = ingestor.fetch(since_hours=24)

        assert len(results) == 1
        assert results[0]["text"] == "Good entry\n\nok"
