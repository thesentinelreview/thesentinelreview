from __future__ import annotations

import uuid
from typing import Any

import structlog

from .base import BaseFeed

log = structlog.get_logger()


class OpenPhishFeed(BaseFeed):
    """Phishing URLs from OpenPhish."""

    feed_handle = "openphish"
    feed_type = "phishing"

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        resp = self._get("https://openphish.com/feed.txt")
        iocs: list[dict[str, Any]] = []
        for line in resp.text.splitlines():
            url = line.strip()
            if not url or not url.startswith("http"):
                continue
            iocs.append({
                "feed_id": feed_id,
                "ioc_type": "url",
                "value": url,
                "threat_type": "phishing",
                "confidence": 85,
                "severity": "high",
                "raw_data": {"source": "openphish"},
            })
        log.info("openphish.fetched", count=len(iocs))
        return iocs
