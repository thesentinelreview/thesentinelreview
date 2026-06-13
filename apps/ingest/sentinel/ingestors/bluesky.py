"""
Bluesky AT Protocol ingestor.

Fetches recent posts from a single Bluesky account (identified by handle).
Requires BLUESKY_HANDLE and BLUESKY_APP_PASSWORD environment variables for
authentication — use an app password from https://bsky.app/settings/app-passwords,
not the main account password.

Pagination: fetches up to _MAX_PAGES pages (each _PAGE_SIZE posts), stopping
early when posts fall before the since_hours cutoff.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_client = None
_PAGE_SIZE = 25
_MAX_PAGES = 10   # up to 250 posts per source per run


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


def _fetch_meta(
    results: list[RawPostData] | None = None,
    *,
    transport_error: str | None = None,
    http_status: int | None = None,
    raw_entries: int | None = None,
    drops: dict | None = None,
) -> dict:
    """Build the last_fetch_meta the ingest_source job reads to stamp source
    health (see db.record_source_fetch). Mirrors rss.py's _meta.

    raw_entries is the count of feed items the API returned (pre-filter); results
    is the count we actually ingest. When they differ, _classify_fetch reports
    "{raw} entries, 0 ingestable ({drops})" instead of the misleading "feed
    reachable but empty (0 entries)" — so a repost-only or parse-failing feed is
    no longer indistinguishable from a genuinely quiet account. Callers that pass
    only a results list (the early-exit paths) keep raw_entries == results, which
    is the prior behavior. http_status lets _classify_fetch pick 'erroring'
    (reachable, refused) over 'url_broken' for HTTP-level failures where atproto
    surfaces the status."""
    n = len(results) if results else 0
    return {
        "transport_error": transport_error,
        "http_status": http_status,
        "raw_entries": raw_entries if raw_entries is not None else n,
        "results": n,
        "drops": drops or {},
        "newest_posted_at": (
            max((r["posted_at"] for r in results), default=None) if results else None
        ),
    }


def _extract_media_urls(post: object) -> list[str]:
    """Extract image/video URLs from a post's embed object."""
    urls: list[str] = []
    embed = getattr(post, "embed", None)
    if embed is None:
        return urls

    # Images embed (AppBskyEmbedImages.View)
    images = getattr(embed, "images", None)
    if images:
        for img in images:
            fullsize = getattr(img, "fullsize", None)
            if fullsize:
                urls.append(fullsize)

    # External link card thumbnail (AppBskyEmbedExternal.View)
    external = getattr(embed, "external", None)
    if external:
        thumb = getattr(external, "thumb", None)
        if thumb:
            urls.append(thumb)

    # Video embed — HLS playlist URL (AppBskyEmbedVideo.View)
    playlist = getattr(embed, "playlist", None)
    if playlist:
        urls.append(playlist)

    return urls


class BlueskyIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        handle = self.source["handle"]
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)

        try:
            client = _get_client()
        except Exception as exc:
            log.error("bluesky_client_error", handle=handle, error=str(exc))
            self.last_fetch_meta = _fetch_meta(
                transport_error=f"{type(exc).__name__}: {exc}"
            )
            return []

        results: list[RawPostData] = []
        cursor: str | None = None
        transport_error: str | None = None
        http_status: int | None = None
        # Pre-filter item count + drop-reason counters, so a feed that returned
        # items we filtered out (all reposts, all stale, all unparseable) is
        # distinguishable from a genuinely empty feed. Mirrors rss.py's drops.
        raw_entries = 0
        drops = {"repost": 0, "too_old": 0, "parse_error": 0}

        for page in range(_MAX_PAGES):
            try:
                kwargs: dict = {"actor": handle, "limit": _PAGE_SIZE}
                if cursor:
                    kwargs["cursor"] = cursor
                feed = client.get_author_feed(**kwargs)
            except Exception as exc:
                log.error(
                    "bluesky_fetch_error",
                    handle=handle,
                    page=page,
                    collected=len(results),
                    error=str(exc),
                )
                # Record the transport error even when earlier pages already
                # collected posts. Those posts still ingest, but a fetch that
                # broke mid-pagination is NOT clean — stamping it as such would
                # zero the error streak and fake a healthy source. Honesty over
                # a falsely-green count.
                transport_error = f"{type(exc).__name__}: {exc}"
                # atproto wraps HTTP errors; extract status if present so
                # _classify_fetch can distinguish 'erroring' from 'url_broken'.
                _resp = getattr(exc, "response", None)
                if _resp is not None:
                    _status = getattr(_resp, "status_code", None)
                    if isinstance(_status, int):
                        http_status = _status
                break

            if not feed.feed:
                break

            hit_cutoff = False
            for item in feed.feed:
                raw_entries += 1
                try:
                    # Skip reposts — only ingest original posts authored by this account
                    if getattr(item, "reason", None) is not None:
                        drops["repost"] += 1
                        continue

                    post = item.post
                    created_at_str = post.record.created_at
                    posted_at = datetime.fromisoformat(
                        created_at_str.replace("Z", "+00:00")
                    )
                    if posted_at < cutoff:
                        drops["too_old"] += 1
                        hit_cutoff = True
                        break

                    uri: str = post.uri
                    text: str = post.record.text
                    post_id = uri.split("/")[-1]
                    archive_url = f"https://bsky.app/profile/{handle}/post/{post_id}"

                    # AT Protocol records include a langs list (BCP 47 codes)
                    langs = getattr(post.record, "langs", None)
                    lang: str | None = langs[0] if langs else None

                    results.append(
                        RawPostData(
                            external_id=uri,
                            posted_at=posted_at,
                            text=text,
                            media_urls=_extract_media_urls(post),
                            archive_url=archive_url,
                            lang=lang,
                        )
                    )
                except Exception as exc:
                    drops["parse_error"] += 1
                    log.warning("bluesky_post_parse_error", handle=handle, error=str(exc))
                    continue

            if hit_cutoff or not getattr(feed, "cursor", None):
                break
            cursor = feed.cursor

        self.last_fetch_meta = _fetch_meta(
            results,
            transport_error=transport_error,
            http_status=http_status,
            raw_entries=raw_entries,
            drops=drops,
        )
        # INFO so the breakdown lands in GitHub Actions logs without a config change.
        #   raw_entries=0                        → feed genuinely empty / handle resolves empty
        #   raw_entries=N, results=0, repost=N   → account only reposts (skipped)
        #   raw_entries=N, results=0, too_old=1  → newest original older than since_hours
        #   raw_entries=N, results=N             → working normally
        log.info(
            "bluesky_fetched",
            handle=handle,
            raw_entries=raw_entries,
            results=len(results),
            drops_repost=drops["repost"],
            drops_too_old=drops["too_old"],
            drops_parse_error=drops["parse_error"],
            since_hours=since_hours,
        )
        return results
