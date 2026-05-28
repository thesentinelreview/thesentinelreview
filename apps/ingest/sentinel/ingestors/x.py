"""
X / Twitter ingestor.

Uses the Twitter v2 /tweets/search/recent endpoint with bearer token auth.
Requires a Basic tier API subscription (~$100/month) for useful rate limits.

Set X_BEARER_TOKEN in .env to enable. Rate limit: 1 request / 15 min per
endpoint on Basic tier, up to 100 results per request with pagination.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import structlog

from sentinel.config import settings
from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"
_MAX_RESULTS = 100


class XIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        if not settings.x_enabled:
            log.warning(
                "x_ingestion_skipped",
                source=self.source["handle"],
                reason="X_BEARER_TOKEN not set — X ingestion requires a paid API subscription",
            )
            return []

        handle = self.source["handle"].lstrip("@")
        since_dt = datetime.now(tz=UTC) - timedelta(hours=since_hours)
        start_time = since_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        headers = {"Authorization": f"Bearer {settings.x_bearer_token}"}
        params: dict[str, str | int] = {
            "query": f"from:{handle}",
            "tweet.fields": "created_at,lang",
            "max_results": _MAX_RESULTS,
            "start_time": start_time,
        }

        results: list[RawPostData] = []
        try:
            with httpx.Client(timeout=30) as client:
                while True:
                    resp = client.get(_SEARCH_URL, headers=headers, params=params)
                    if resp.status_code == 429:
                        log.warning("x_rate_limited", handle=handle)
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
        except httpx.HTTPError as exc:
            log.error("x_fetch_error", handle=handle, error=str(exc))

        log.debug("x_fetched", handle=handle, count=len(results))
        return results
