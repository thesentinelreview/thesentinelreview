"""
X / Twitter ingestor.

Uses the Twitter v2 /tweets/search/recent endpoint with bearer token auth.
Requires a Basic tier API subscription (~$100/month) for useful rate limits.

Set X_BEARER_TOKEN in .env to enable. Rate limit: 1 request / 15 min per
endpoint on Basic tier, up to 100 results per request with pagination.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import structlog

from sentinel.config import settings
from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"
_MAX_RESULTS = 100


def _fetch_meta(
    results: list[RawPostData] | None = None,
    *,
    transport_error: str | None = None,
    http_status: int | None = None,
) -> dict:
    """Build the last_fetch_meta the ingest_source job reads to stamp source
    health (see db.record_source_fetch). Mirrors rss.py's _meta. For X a
    "result" is a captured tweet, so raw_entries == results: >0 yields
    healthy with a real last_post_at, 0 yields silent, and transport_error
    yields erroring/url_broken instead of a false silent. http_status lets the
    classifier pick 'erroring' (reachable, refused — e.g. a 429) over the bare
    'url_broken' it assumes for a status-less transport error."""
    n = len(results) if results else 0
    return {
        "transport_error": transport_error,
        "http_status": http_status,
        "raw_entries": n,
        "results": n,
        "newest_posted_at": (
            max((r["posted_at"] for r in results), default=None)
            if results else None
        ),
    }


class XIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        if not settings.x_enabled:
            log.warning(
                "x_ingestion_skipped",
                source=self.source["handle"],
                reason="X_BEARER_TOKEN not set — X ingestion requires a paid API subscription",
            )
            self.last_fetch_meta = _fetch_meta([])
            return []

        handle = self.source["handle"].lstrip("@")
        since_dt = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)
        start_time = since_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        headers = {"Authorization": f"Bearer {settings.x_bearer_token}"}
        params: dict[str, str | int] = {
            "query": f"from:{handle}",
            "tweet.fields": "created_at,lang",
            "max_results": _MAX_RESULTS,
            "start_time": start_time,
        }

        results: list[RawPostData] = []
        transport_error: str | None = None
        http_status: int | None = None
        try:
            with httpx.Client(timeout=30) as client:
                while True:
                    resp = client.get(_SEARCH_URL, headers=headers, params=params)
                    if resp.status_code == 429:
                        # Rate-limited mid-run. Anything collected so far still
                        # ingests, but record the transport error (with the 429
                        # status) so the fetch is stamped 'erroring' rather than a
                        # false healthy/silent — a rate limit is a reachable host
                        # refusing, not a quiet account, and it must not zero the
                        # error streak as if the run were clean.
                        http_status = 429
                        transport_error = (
                            f"HTTP 429 rate limited after {len(results)} tweet(s)"
                        )
                        log.warning("x_rate_limited", handle=handle, collected=len(results))
                        break
                    resp.raise_for_status()
                    data = resp.json()
                    for tweet in data.get("data") or []:
                        results.append(
                            RawPostData(
                                external_id=tweet["id"],
                                posted_at=datetime.fromisoformat(
                                    tweet["created_at"].replace("Z", "+00:00")
                                ),
                                text=tweet["text"],
                                media_urls=[],
                                archive_url=f"https://x.com/{handle}/status/{tweet['id']}",
                                lang=tweet.get("lang"),
                            )
                        )
                    next_token = data.get("meta", {}).get("next_token")
                    if not next_token:
                        break
                    params["pagination_token"] = next_token
        except httpx.HTTPStatusError as exc:
            # A >= 400 response (reachable host, refused) — keep the status so the
            # classifier stamps 'erroring' rather than 'url_broken'.
            http_status = exc.response.status_code
            transport_error = f"{type(exc).__name__}: {exc}"
            log.error("x_fetch_error", handle=handle, error=str(exc))
        except httpx.HTTPError as exc:
            # Bare transport failure (DNS/conn/SSL/timeout): no HTTP status.
            transport_error = f"{type(exc).__name__}: {exc}"
            log.error("x_fetch_error", handle=handle, error=str(exc))

        self.last_fetch_meta = _fetch_meta(
            results, transport_error=transport_error, http_status=http_status
        )
        log.debug("x_fetched", handle=handle, count=len(results))
        return results
