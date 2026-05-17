"""
RSS / Atom feed ingestor.

Covers: Reuters, AP, AFP, Ukrinform, Kyiv Independent, Meduza,
        Interfax Ukraine, UNIAN, TASS (monitor-only).

Requires: feedparser, httpx
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import feedparser
import httpx
import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_TIMEOUT = 30       # seconds
_MAX_ENTRIES = 200  # hard cap per fetch to avoid runaway memory


class RSSIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        url = self.source.get("url")
        if not url:
            log.warning("rss_no_url", source=self.source["handle"])
            return []

        raw_xml = _fetch_feed(url)
        if raw_xml is None:
            return []

        feed = feedparser.parse(raw_xml)
        cutoff = _cutoff_dt(since_hours)
        results: list[RawPostData] = []

        for entry in feed.entries[:_MAX_ENTRIES]:
            try:
                post = _parse_entry(entry, cutoff=cutoff)
            except Exception as exc:
                log.warning("rss_parse_error", source=self.source["handle"], error=str(exc))
                continue
            if post is not None:
                results.append(post)

        log.debug("rss_fetched", source=self.source["handle"], count=len(results))
        return results


def _fetch_feed(url: str) -> bytes | None:
    try:
        response = httpx.get(
            url,
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; SentinelReview/0.1; RSS aggregator)"},
        )
        response.raise_for_status()
        return response.content
    except httpx.HTTPError as exc:
        log.error("rss_fetch_error", url=url, error=str(exc))
        return None


def _parse_entry(entry: feedparser.FeedParserDict, *, cutoff: datetime) -> RawPostData | None:
    published = _parse_date(entry)
    if published is None or published < cutoff:
        return None

    title = getattr(entry, "title", "") or ""
    summary = getattr(entry, "summary", "") or ""
    text = f"{title}\n\n{summary}".strip() if summary else title
    if not text:
        return None

    # Use entry.id → entry.link → hash of text as fallback external_id
    external_id = (
        getattr(entry, "id", None)
        or getattr(entry, "link", None)
        or hashlib.sha1(text.encode()).hexdigest()
    )

    media_urls: list[str] = []
    for enc in getattr(entry, "enclosures", []):
        href = getattr(enc, "href", None)
        if href:
            media_urls.append(href)

    return RawPostData(
        external_id=str(external_id),
        posted_at=published,
        text=text,
        media_urls=media_urls,
        archive_url=getattr(entry, "link", None),
        lang=None,   # feedparser doesn't reliably detect language
    )


def _parse_date(entry: feedparser.FeedParserDict) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        t = getattr(entry, attr, None)
        if t is not None:
            try:
                import calendar
                ts = calendar.timegm(t)
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except Exception:
                continue
    return None


def _cutoff_dt(since_hours: int) -> datetime:
    from datetime import timedelta
    return datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
