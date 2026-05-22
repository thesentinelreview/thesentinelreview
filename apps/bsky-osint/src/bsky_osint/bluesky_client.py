from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://public.api.bsky.app/xrpc"
_DEFAULT_DELAY = 0.5
_MAX_RETRIES = 3


class BlueskyClient:
    def __init__(self, cache_dir: Path | None = None, request_delay: float = _DEFAULT_DELAY):
        self._delay = request_delay
        self._last_request_at: float = 0.0
        cache_path = cache_dir or Path(os.environ.get("BSKY_OSINT_CACHE_DIR", ".cache"))

        try:
            import diskcache
            self._cache: Any = diskcache.Cache(str(cache_path))
        except ImportError:
            self._cache = None

    def _cache_key(self, method: str, params: dict) -> str:
        blob = json.dumps({"method": method, "params": params}, sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()

    def _get(self, method: str, params: dict) -> dict:
        key = self._cache_key(method, params)
        if self._cache is not None:
            hit = self._cache.get(key)
            if hit is not None:
                return hit

        self._throttle()
        backoff = 2.0
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = httpx.get(
                    f"{BASE_URL}/{method}",
                    params=params,
                    timeout=30.0,
                    headers={"Accept": "application/json"},
                )
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", backoff))
                    logger.warning("Rate limited; sleeping %.1fs", retry_after)
                    time.sleep(retry_after)
                    backoff *= 2
                    continue
                resp.raise_for_status()
                data = resp.json()
                if self._cache is not None:
                    self._cache.set(key, data, expire=3600)
                return data
            except httpx.HTTPStatusError as exc:
                if attempt < _MAX_RETRIES:
                    logger.warning("HTTP %s on attempt %d; retrying in %.1fs", exc.response.status_code, attempt + 1, backoff)
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    raise
        return {}

    def _throttle(self):
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self._delay:
            time.sleep(self._delay - elapsed)
        self._last_request_at = time.monotonic()

    def search_posts(
        self,
        q: str,
        limit: int = 100,
        cursor: str | None = None,
        since: str | None = None,
        until: str | None = None,
        lang: str | None = None,
    ) -> dict:
        params: dict = {"q": q, "limit": min(limit, 100)}
        if cursor:
            params["cursor"] = cursor
        if since:
            params["since"] = since
        if until:
            params["until"] = until
        if lang:
            params["lang"] = lang
        return self._get("app.bsky.feed.searchPosts", params)

    def search_actors(self, q: str, limit: int = 100, cursor: str | None = None) -> dict:
        params: dict = {"q": q, "limit": min(limit, 100)}
        if cursor:
            params["cursor"] = cursor
        return self._get("app.bsky.actor.searchActors", params)

    def get_profile(self, actor: str) -> dict:
        return self._get("app.bsky.actor.getProfile", {"actor": actor})

    def get_author_feed(self, actor: str, limit: int = 100, cursor: str | None = None) -> dict:
        params: dict = {"actor": actor, "limit": min(limit, 100)}
        if cursor:
            params["cursor"] = cursor
        return self._get("app.bsky.feed.getAuthorFeed", params)
