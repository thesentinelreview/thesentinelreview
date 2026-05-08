"""
X / Twitter ingestor — STUB

X API v2 requires a paid subscription (Basic tier: ~$100/month) for useful
read-access rate limits. This stub raises a clear error if called so the
worker doesn't silently skip X sources.

When ready to implement:
  - Set X_BEARER_TOKEN in .env
  - Replace the body of XIngestor.fetch() with calls to the v2 /tweets/search/recent
    endpoint using httpx and the bearer token.
  - Rate limit: 1 request / 15 min on Basic tier (~10 results/req)
  - Consider archiving each tweet URL via web.archive.org at ingest time.

See: https://developer.twitter.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-recent
"""
from __future__ import annotations

import structlog

from sentinel.config import settings
from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()


class XIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        if not settings.x_enabled:
            log.warning(
                "x_ingestion_skipped",
                source=self.source["handle"],
                reason="X_BEARER_TOKEN not set — X ingestion requires a paid API subscription",
            )
            return []

        # TODO: implement when API budget is approved
        raise NotImplementedError(
            "X ingestor not yet implemented. Set X_BEARER_TOKEN and implement "
            "the v2 /tweets/search/recent call in sentinel/ingestors/x.py"
        )
