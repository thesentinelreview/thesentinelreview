"""
RSS / Atom feed ingestor.

Covers: Reuters, AP, AFP, Ukrinform, Kyiv Independent, Meduza,
        Interfax Ukraine, UNIAN, TASS (monitor-only).

Requires: feedparser, httpx
"""
from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from typing import NamedTuple

import feedparser
import httpx
import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_TIMEOUT = 30       # seconds
_MAX_ENTRIES = 200  # hard cap per fetch to avoid runaway memory


class _FetchResult(NamedTuple):
    """Outcome of an HTTP fetch — carries enough to classify the feed's health
    (LIVE / MOVED / BLOCKED / unparseable) instead of collapsing every failure
    into a bare ``None``."""
    content:         bytes | None
    http_status:     int | None
    content_type:    str
    transport_error: str | None   # set on connect/timeout/DNS/SSL or HTTP >= 400
    final_url:       str | None   # post-redirect URL (surfaces MOVED feeds)


class RSSIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        handle = self.source["handle"]
        url = self.source.get("url")
        if not url:
            log.warning("rss_no_url", source=handle)
            self.last_fetch_meta = _meta(transport_error="no url configured")
            return []

        fr = _fetch_feed(url, handle=handle)
        if fr.content is None:
            # Transport failure or HTTP >= 400 — record why so the source row
            # shows the real reason instead of a silent 0-yield.
            self.last_fetch_meta = _meta(
                http_status=fr.http_status,
                content_type=fr.content_type,
                transport_error=fr.transport_error,
                final_url=fr.final_url,
            )
            return []

        feed = feedparser.parse(fr.content)
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

        self.last_fetch_meta = _meta(
            http_status=fr.http_status,
            content_type=fr.content_type,
            raw_entries=len(feed.entries),
            results=len(results),
            drops=dict(drops),
            bozo=bool(getattr(feed, "bozo", False)),
            bozo_reason=bozo_reason,
            newest_posted_at=max((p["posted_at"] for p in results), default=None),
            final_url=fr.final_url,
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


def _meta(
    *,
    http_status: int | None = None,
    content_type: str = "",
    transport_error: str | None = None,
    raw_entries: int = 0,
    results: int = 0,
    drops: dict | None = None,
    bozo: bool = False,
    bozo_reason: str | None = None,
    newest_posted_at: datetime | None = None,
    final_url: str | None = None,
) -> dict:
    """Build a uniform last_fetch_meta dict (so every fetch path stamps the same shape)."""
    return {
        "http_status": http_status,
        "content_type": content_type,
        "transport_error": transport_error,
        "raw_entries": raw_entries,
        "results": results,
        "drops": drops or {},
        "bozo": bozo,
        "bozo_reason": bozo_reason,
        "newest_posted_at": newest_posted_at,
        "final_url": final_url,
    }


def _retry_after_seconds(response: httpx.Response, *, default: int = 5, cap: int = 10) -> int:
    """Seconds to wait before a single 429 retry. Honors a small integer
    Retry-After header; falls back to `default` for absent/HTTP-date values.
    Capped so one rate-limited feed can't stall the whole ingest cycle."""
    raw = response.headers.get("Retry-After", "")
    try:
        return max(0, min(int(raw), cap))
    except (TypeError, ValueError):
        return default


def _fetch_feed(url: str, *, handle: str) -> _FetchResult:
    response: httpx.Response | None = None
    for attempt in (1, 2):
        try:
            response = httpx.get(
                url,
                timeout=_TIMEOUT,
                follow_redirects=True,
                headers=_BROWSER_HEADERS,
            )
        except httpx.HTTPError as exc:
            log.error("rss_fetch_error", source=handle, url=url, error=str(exc))
            return _FetchResult(None, None, "", f"{type(exc).__name__}: {exc}", None)

        # Single polite retry on 429 (rate-limited): honor Retry-After when it's a
        # small int, else ~5s. One retry only — let the next cron pick it up rather
        # than hammer the host in-cycle.
        if response.status_code == 429 and attempt == 1:
            delay = _retry_after_seconds(response)
            log.warning("rss_rate_limited", source=handle, url=url, retry_after=delay)
            time.sleep(delay)
            continue
        break

    assert response is not None  # loop always assigns or returns
    content_type = response.headers.get("content-type", "").lower()
    final_url = str(response.url)
    status = response.status_code
    if status >= 400:
        # 403 is the classic WAF / .mil UA-or-IP gate; 404 a moved/dead feed.
        log.error("rss_fetch_error", source=handle, url=url, status=status)
        return _FetchResult(None, status, content_type, f"HTTP {status}", final_url)

    # Warn if the response doesn't look like a feed. Cloudflare challenge pages
    # return 200 OK with text/html; feedparser silently returns 0 entries.
    if "html" in content_type and "xml" not in content_type:
        log.warning(
            "rss_non_xml_response",
            source=handle,
            url=url,
            content_type=content_type,
            status=status,
            bytes=len(response.content),
        )
    return _FetchResult(response.content, status, content_type, None, final_url)


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
