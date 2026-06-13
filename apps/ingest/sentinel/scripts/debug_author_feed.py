"""
One-shot Bluesky author-feed dump for diagnosing silent feeds.

Fetches up to --pages pages per handle WITHOUT breaking on stale items (unlike
the real ingestor), so we can detect the early-break bug: get_author_feed is
ordered by indexedAt with repost/thread interleaving, not strict created_at
order — a stale item early in the feed would cause the real loop to break and
skip fresher posts further down.

No database access. Output to stdout only.

Usage:
    python -m sentinel.scripts.debug_author_feed \\
        --handles osinttechnical.bsky.social,thestudyofwar.bsky.social \\
        --pages 3 --since-hours 24
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from sentinel.ingestors.bluesky import _PAGE_SIZE, _get_client


_DEFAULT_HANDLES = (
    "osinttechnical.bsky.social,"
    "uacontrolmap.bsky.social,"
    "defense-of-ukraine.bsky.social,"
    "kasperhoffmann.bsky.social,"
    "thestudyofwar.bsky.social"
)


def _parse_created_at(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _dump_handle(client: object, handle: str, pages: int, since_hours: int) -> None:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)

    print(f"\n{'='*72}")
    print(f"HANDLE: {handle}  (cutoff={cutoff.isoformat(timespec='seconds')})")
    print(f"{'='*72}")
    print(
        f"{'page':>4} {'idx':>4} {'repost':>6} {'reply':>5} {'in_win':>6} "
        f"{'author':<30} {'created_at':<26} {'indexed_at':<26} text"
    )
    print("-" * 160)

    cursor: str | None = None
    global_idx = 0

    # Collected per-item data for VERDICT
    items_data: list[dict] = []

    for page in range(pages):
        try:
            kwargs: dict = {"actor": handle, "limit": _PAGE_SIZE}
            if cursor:
                kwargs["cursor"] = cursor
            feed = client.get_author_feed(**kwargs)
        except Exception as exc:
            print(f"  [fetch error page={page}: {type(exc).__name__}: {exc}]")
            break

        if not feed.feed:
            break

        for item in feed.feed:
            try:
                is_repost = getattr(item, "reason", None) is not None
                post = item.post
                is_reply = getattr(post.record, "reply", None) is not None
                author = post.author.handle
                created_at_str = post.record.created_at
                created_at = _parse_created_at(created_at_str)
                indexed_at_raw = getattr(post, "indexed_at", None)
                indexed_at = (
                    _parse_created_at(indexed_at_raw) if indexed_at_raw else None
                )
                in_window = created_at >= cutoff
                text_head = post.record.text.replace("\n", " ")[:80]

                items_data.append(
                    {
                        "global_idx": global_idx,
                        "page": page,
                        "is_repost": is_repost,
                        "is_reply": is_reply,
                        "author": author,
                        "created_at": created_at,
                        "indexed_at": indexed_at,
                        "in_window": in_window,
                        "text_head": text_head,
                    }
                )

                indexed_str = (
                    indexed_at.isoformat(timespec="seconds") if indexed_at else "n/a"
                )
                print(
                    f"{page:>4} {global_idx:>4} {str(is_repost):>6} {str(is_reply):>5} "
                    f"{str(in_window):>6} {author:<30} "
                    f"{created_at.isoformat(timespec='seconds'):<26} "
                    f"{indexed_str:<26} {text_head}"
                )
            except Exception as exc:
                print(
                    f"{page:>4} {global_idx:>4} {'?':>6} {'?':>5} {'?':>6} "
                    f"{'parse_error':<30} {'n/a':<26} {'n/a':<26} "
                    f"[{type(exc).__name__}: {exc}]"
                )
                items_data.append(
                    {
                        "global_idx": global_idx,
                        "page": page,
                        "is_repost": None,
                        "is_reply": None,
                        "author": "?",
                        "created_at": None,
                        "indexed_at": None,
                        "in_window": False,
                        "text_head": f"[parse_error: {exc}]",
                    }
                )

            global_idx += 1

        if not getattr(feed, "cursor", None):
            break
        cursor = feed.cursor

    _print_verdict(handle, items_data, since_hours)


def _print_verdict(handle: str, items: list[dict], since_hours: int) -> None:
    total = len(items)
    reposts = sum(1 for d in items if d["is_repost"] is True)
    replies = sum(1 for d in items if d["is_reply"] is True)

    # Only look at items that parsed successfully
    valid = [d for d in items if d["created_at"] is not None]
    originals = [d for d in valid if not d["is_repost"]]
    in_window_originals = [d for d in originals if d["in_window"]]

    # K = global_idx of the first non-repost item with created_at < cutoff
    # (the item at which the real ingestor loop would break)
    k_item = next(
        (d for d in originals if not d["in_window"]),
        None,
    )

    newest_original_at = (
        max((d["created_at"] for d in originals), default=None)
        if originals
        else None
    )

    print()
    print(f"  counts: total={total}  repost={reposts}  reply={replies}  "
          f"in_window_originals={len(in_window_originals)}")

    if total == 0:
        verdict = "EMPTY FEED / handle resolved to no posts"
    elif k_item is not None:
        K = k_item["global_idx"]
        # Any in-window original AFTER K in the feed?
        fresh_after_k = [d for d in in_window_originals if d["global_idx"] > K]
        if fresh_after_k:
            newest_later = max(d["created_at"] for d in fresh_after_k)
            verdict = (
                f"EARLY-BREAK CONFIRMED: real loop breaks at idx {K} "
                f"but {len(fresh_after_k)} fresh original(s) exist later "
                f"(newest later created_at={newest_later.isoformat(timespec='seconds')})"
            )
        elif in_window_originals:
            verdict = f"WORKING: {len(in_window_originals)} in-window original(s) would ingest"
        elif reposts > total / 2:
            oldest_str = (
                newest_original_at.isoformat(timespec="seconds")
                if newest_original_at
                else "n/a"
            )
            verdict = (
                f"REPOST-DOMINATED: {reposts}/{total} reposts; "
                f"newest original created_at={oldest_str}"
            )
        else:
            oldest_str = (
                newest_original_at.isoformat(timespec="seconds")
                if newest_original_at
                else "n/a"
            )
            verdict = (
                f"GENUINELY STALE: newest original older than {since_hours}h "
                f"(created_at={oldest_str})"
            )
    elif len(in_window_originals) > 0:
        verdict = f"WORKING: {len(in_window_originals)} in-window original(s) would ingest"
    elif reposts > total / 2:
        oldest_str = (
            newest_original_at.isoformat(timespec="seconds")
            if newest_original_at
            else "n/a"
        )
        verdict = (
            f"REPOST-DOMINATED: {reposts}/{total} reposts; "
            f"newest original created_at={oldest_str}"
        )
    else:
        oldest_str = (
            newest_original_at.isoformat(timespec="seconds")
            if newest_original_at
            else "n/a"
        )
        verdict = (
            f"GENUINELY STALE: newest original older than {since_hours}h "
            f"(created_at={oldest_str})"
        )

    print(f"  VERDICT: {verdict}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dump Bluesky author-feed without breaking on stale items"
    )
    parser.add_argument(
        "--handles",
        default=_DEFAULT_HANDLES,
        help="Comma-separated Bluesky handles",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=3,
        help="Max pages to fetch per handle",
    )
    parser.add_argument(
        "--since-hours",
        type=int,
        default=24,
        dest="since_hours",
        help="Recency window in hours",
    )
    args = parser.parse_args()

    handles = [h.strip() for h in args.handles.split(",") if h.strip()]

    try:
        client = _get_client()
    except Exception as exc:
        print(f"[FATAL] Could not create Bluesky client: {exc}")
        raise SystemExit(1)

    for handle in handles:
        _dump_handle(client, handle, args.pages, args.since_hours)

    print()


if __name__ == "__main__":
    main()
