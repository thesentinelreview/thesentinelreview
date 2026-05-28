"""
RSS / Atom feed ingestor.

Covers: Reuters, AP, AFP, Ukrinform, Kyiv Independent, Meduza,
        Interfax Ukraine, UNIAN, TASS (monitor-only).

Requires: feedparser, httpx
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime

import feedparser
import httpx
import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_TIMEOUT = 30       # seconds
_MAX_ENTRIES = 200  # hard cap per fetch to avoid runaway memory


class RSSIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        handle = self.source["handle"]
        url = self.source.get("url")
        if not url:
            log.warning("rss_no_url", source=handle)
            return []

        raw_xml = _fetch_feed(url, handle=handle)
        if raw_xml is None:
            return []

        feed = feedparser.parse(raw_xml)
        cutoff = _cutoff_dt(since_hours)
        results: list[RawPostData] = []

        # Drop-reason counters — surface why entries fell out of the pipeline.
        # Without these, a feed returning 50 entries but dropping all of them
        # looks identical to a feed returning 0 entries.
        drops = {"no_date": 0, "too_old": 0, "no_text": 0, "parse_error": 0}

        for entry in feed.entries[:_MAX_ENTRIES]:
            try:
                post, reason = _parse_entry(entry, cutoff=cutoff)
            except Exception as exc:
                drops["parse_error"] += 1
                log.warning("rss_parse_error", source=handle, error=str(exc))
                continue
            if post is not None:
                results.append(post)
            elif reason:
                drops[reason] = drops.get(reason, 0) + 1

        bozo_reason = None
        if getattr(feed, "bozo", False):
            bozo_exc = getattr(feed, "bozo_exception", None)
            bozo_reason = type(bozo_exc).__name__ if bozo_exc else "unknown"

        # INFO-level so it appears in GitHub Actions logs without changing log config.
        # Diagnostic patterns:
        #   raw_entries=0, bozo=True  → response is not valid XML (Cloudflare challenge,
        #                               HTML page, or empty body). Check rss_non_xml_response.
        #   raw_entries=N, results=0, drops_too_old=N  → feed alive but stale; entries
        #                               older than since_hours cutoff.
        #   raw_entries=N, results=0, drops_no_date=N  → feed lacks <pubDate>/<updated>
        #                               tags; cannot be ingested without one.
        #   raw_entries=N, results=N  → working normally.
        log.info(
            "rss_fetched",
            source=handle,
            raw_entries=len(feed.entries),
            results=len(results),
            drops_no_date=drops["no_date"],
            drops_too_old=drops["too_old"],
            drops_no_text=drops["no_text"],
            drops_parse_error=drops["parse_error"],
            bozo=getattr(feed, "bozo", False),
            bozo_reason=bozo_reason,
            since_hours=since_hours,
        )
        return results


# Browser-like headers to bypass aggressive WAF / Cloudflare bot detection.
# Polite "RSS aggregator" UAs are now widely flagged. Most public news feeds
# only respond normally to UAs that look like a real desktop browser.
# Pinning a specific Chrome version stays stable across runs and matches what
# most automated tools use in 2026.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "application/rss+xml, application/atom+xml, application/xml;q=0.9, "
        "text/xml;q=0.9, text/html;q=0.8, */*;q=0.7"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def _fetch_feed(url: str, *, handle: str) -> bytes | None:
    try:
        response = httpx.get(
            url,
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        )
        response.raise_for_status()
        # Warn if the response doesn't look like a feed. Cloudflare challenge pages
        # return 200 OK with text/html; feedparser silently returns 0 entries.
        content_type = response.headers.get("content-type", "").lower()
        if "html" in content_type and "xml" not in content_type:
            log.warning(
                "rss_non_xml_response",
                source=handle,
                url=url,
                content_type=content_type,
                status=response.status_code,
                bytes=len(response.content),
            )
        return response.content
    except httpx.HTTPError as exc:
        log.error("rss_fetch_error", source=handle, url=url, error=str(exc))
        return None


def _parse_entry(
    entry: feedparser.FeedParserDict, *, cutoff: datetime
) -> tuple[RawPostData | None, str | None]:
    """Return (post, drop_reason). Exactly one of the two is non-None."""
    published = _parse_date(entry)
    if published is None:
        return None, "no_date"
    if published < cutoff:
        return None, "too_old"

    title = getattr(entry, "title", "") or ""
    summary = getattr(entry, "summary", "") or ""
    text = f"{title}\n\n{summary}".strip() if summary else title
    if not text:
        return None, "no_text"

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
    ), None


def _parse_date(entry: feedparser.FeedParserDict) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        t = getattr(entry, attr, None)
        if t is not None:
            try:
                import calendar
                ts = calendar.timegm(t)
                return datetime.fromtimestamp(ts, tz=UTC)
            except Exception:
                continue
    return None


def _cutoff_dt(since_hours: int) -> datetime:
    from datetime import timedelta
    return datetime.now(tz=UTC) - timedelta(hours=since_hours)
