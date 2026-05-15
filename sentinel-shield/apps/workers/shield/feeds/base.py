from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

log = structlog.get_logger()

HTTP_TIMEOUT = 30.0


class BaseFeed(ABC):
    feed_handle: str
    feed_type: str

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
    def _get(self, url: str, **kwargs: Any) -> httpx.Response:
        with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, **kwargs)
            resp.raise_for_status()
            return resp

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
    def _post(self, url: str, **kwargs: Any) -> httpx.Response:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(url, **kwargs)
            resp.raise_for_status()
            return resp

    @abstractmethod
    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        """Fetch and return normalized IOC dicts ready for bulk_upsert_iocs."""
