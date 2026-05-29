"""
One-shot, read-only feed-URL probe (Phase C — silent-RSS recovery).

Fetches a fixed set of CANDIDATE feed URLs from the *Actions runner's* network
vantage — the only egress that matches the live pipeline — and records, per
candidate: HTTP status, content-type, post-redirect URL, whether it parses as a
feed, and the entry count. Results land in a scratch table ``feed_probe_results``,
read back via Supabase to choose the winning URLs for migration 0019.

Read-only with respect to ``sources``. Reuses the production fetcher
(``rss._fetch_feed``) so headers / redirects / 429-retry match what ingest sees.
Does NOT touch the drain/extraction path. The scratch table is dropped by 0019.
"""
from __future__ import annotations

import re
import sys

import feedparser
import structlog

from sentinel.db import get_conn
from sentinel.ingestors.rss import _fetch_feed

log = structlog.get_logger()

# handle_hint -> ordered candidate URLs. The first entry-count>0 winner per handle
# is the URL to apply in migration 0019.
_CANDIDATES: dict[str, list[str]] = {
    "mizzima_rss": [
        "https://eng.mizzima.com/feed/",
        "https://eng.mizzima.com/category/myanmar-news/feed/",
        "https://eng.mizzima.com/category/news/feed/",
        "https://eng.mizzima.com/feed/rss/",
    ],
    "iranintl_rss": [
        "https://www.iranintl.com/en/feed",
        "https://www.iranintl.com/feed",
        "https://www.iranintl.com/rss",
        "https://www.iranintl.com/en/rss.xml",
    ],
}

# indopacom: the RSS.ashx module works but Site=2 is the wrong Site id (returns
# empty, not blocked). Rather than brute-forcing Site numbers, scrape the news
# page for the real RSS.ashx href and reuse its Site value.
_INDOPACOM_PAGES = ["https://www.pacom.mil/Media/News/"]
_SITE_RE = re.compile(r"RSS\.ashx\?[^\"'<>\s]*?Site=(\d+)", re.IGNORECASE)


_DDL = """
CREATE TABLE IF NOT EXISTS feed_probe_results (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle_hint     text NOT NULL,
    candidate_url   text NOT NULL,
    http_status     int,
    content_type    text,
    final_url       text,
    raw_entries     int,
    parses_as_feed  boolean,
    transport_error text,
    probed_at       timestamptz NOT NULL DEFAULT now()
)
"""


def _probe_one(handle_hint: str, url: str) -> dict:
    """Fetch one candidate URL and summarize how feed-like the response is."""
    fr = _fetch_feed(url, handle=handle_hint)
    raw_entries = 0
    if fr.content is not None:
        feed = feedparser.parse(fr.content)
        raw_entries = len(feed.entries)
    row = {
        "handle_hint": handle_hint,
        "candidate_url": url,
        "http_status": fr.http_status,
        "content_type": fr.content_type or None,
        "final_url": fr.final_url,
        "raw_entries": raw_entries,
        "parses_as_feed": raw_entries > 0,
        "transport_error": fr.transport_error,
    }
    log.info("probe_result", **row)
    return row


def _indopacom_candidates() -> list[str]:
    """Scrape the INDOPACOM news page(s) for the real RSS.ashx Site id(s) and
    build canonical candidate feed URLs (ContentType=1&max=20)."""
    sites: list[str] = []
    for page in _INDOPACOM_PAGES:
        fr = _fetch_feed(page, handle="indopacom_discovery")
        if fr.content is None:
            log.warning(
                "indopacom_page_unreachable",
                url=page, status=fr.http_status, error=fr.transport_error,
            )
            continue
        for site in _SITE_RE.findall(fr.content.decode("utf-8", "ignore")):
            if site not in sites:
                sites.append(site)
    return [
        f"https://www.pacom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site={s}&max=20"
        for s in sites
    ]


def run() -> None:
    candidates: dict[str, list[str]] = {k: list(v) for k, v in _CANDIDATES.items()}

    indo = _indopacom_candidates()
    if indo:
        candidates["indopacom_myanmar"] = indo
    else:
        log.warning("indopacom_no_candidates_discovered")

    rows = [
        _probe_one(handle_hint, url)
        for handle_hint, urls in candidates.items()
        for url in urls
    ]

    # Scratch table: recreate-and-replace so re-runs don't accumulate stale rows.
    with get_conn() as conn:
        conn.execute(_DDL)
        conn.execute("DELETE FROM feed_probe_results")
        for r in rows:
            conn.execute(
                """
                INSERT INTO feed_probe_results
                    (handle_hint, candidate_url, http_status, content_type,
                     final_url, raw_entries, parses_as_feed, transport_error)
                VALUES
                    (%(handle_hint)s, %(candidate_url)s, %(http_status)s, %(content_type)s,
                     %(final_url)s, %(raw_entries)s, %(parses_as_feed)s, %(transport_error)s)
                """,
                r,
            )
        conn.commit()

    print("\nFEED PROBE RESULTS (entries>0 = candidate winner):", flush=True)
    for r in rows:
        flag = "WIN " if r["parses_as_feed"] else "    "
        detail = r["transport_error"] or (r["content_type"] or "")
        print(
            f"  [{flag}] {r['handle_hint']:18} entries={r['raw_entries']:>3} "
            f"status={r['http_status']} {detail[:40]:40} {r['candidate_url']}",
            flush=True,
        )
    print(f"\nProbed {len(rows)} candidate URL(s). Read feed_probe_results in Supabase.", flush=True)
    sys.exit(0)
