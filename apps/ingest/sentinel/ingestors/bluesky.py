"""
Bluesky AT Protocol ingestor.

Fetches recent posts from a single Bluesky account (identified by handle).
Requires BLUESKY_HANDLE and BLUESKY_APP_PASSWORD environment variables for
authentication — use an app password from https://bsky.app/settings/app-passwords,
not the main account password.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_client = None


def _get_client() -> object:
    global _client
    if _client is None:
        try:
            from atproto import Client  # type: ignore[import-untyped]
        except ImportError as exc:
            raise RuntimeError("atproto package required: pip install atproto") from exc
        handle = os.environ.get("BLUESKY_HANDLE")
        password = os.environ.get("BLUESKY_APP_PASSWORD")
        if not handle or not password:
            raise RuntimeError("BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set")
        c = Client()
        c.login(handle, password)
        _client = c
    return _client


class BlueskyIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        handle = self.source["handle"]
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)

        try:
            client = _get_client()
            feed = client.get_author_feed(actor=handle, limit=25)
        except Exception as exc:
            log.error("bluesky_fetch_error", handle=handle, error=str(exc))
            return []

        results: list[RawPostData] = []
        for item in feed.feed:
            try:
                post = item.post
                created_at_str = post.record.created_at
                posted_at = datetime.fromisoformat(
                    created_at_str.replace("Z", "+00:00")
                )
                if posted_at < cutoff:
                    continue

                uri: str = post.uri
                text: str = post.record.text
                post_id = uri.split("/")[-1]
                archive_url = f"https://bsky.app/profile/{handle}/post/{post_id}"

                results.append(
                    RawPostData(
                        external_id=uri,
                        posted_at=posted_at,
                        text=text,
                        media_urls=[],
                        archive_url=archive_url,
                        lang=None,
                    )
                )
            except Exception as exc:
                log.warning("bluesky_post_parse_error", handle=handle, error=str(exc))
                continue

        log.debug("bluesky_fetched", handle=handle, count=len(results))
        return results
