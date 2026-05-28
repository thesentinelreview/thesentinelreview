"""
ingest_source job
-----------------
Fetches new posts from a single source and inserts them into raw_posts.
Creates extract_events jobs for every batch of new posts.

Payload schema: IngestSourcePayload
"""
from __future__ import annotations

import uuid

import psycopg
import structlog

from sentinel.config import settings
from sentinel.db import enqueue, get_source, insert_raw_post
from sentinel.models import IngestSourcePayload

log = structlog.get_logger()


def run(conn: psycopg.Connection, *, job_id: uuid.UUID, payload: dict) -> None:
    params = IngestSourcePayload.model_validate(payload)
    source = get_source(conn, params.source_id)
    if source is None:
        raise ValueError(f"Source not found: {params.source_id}")

    platform = source["platform"]
    log.info("ingesting_source", source=source["handle"], platform=platform)

    new_ids = _ingest(conn, source=source, since_hours=params.since_hours)

    log.info("ingested_posts", source=source["handle"], new_count=len(new_ids))

    # Enqueue extraction jobs in batches
    batch_size = settings.worker_batch_size
    for i in range(0, len(new_ids), batch_size):
        batch = new_ids[i : i + batch_size]
        enqueue(
            conn,
            "extract_events",
            {"raw_post_ids": [str(x) for x in batch], "source_id": str(params.source_id)},
        )
        log.debug("enqueued_extract_batch", batch_size=len(batch))


def _ingest(
    conn: psycopg.Connection,
    *,
    source: dict,
    since_hours: int,
) -> list[uuid.UUID]:
    platform = source["platform"]

    if platform == "rss":
        from sentinel.ingestors.rss import RSSIngestor
        ingestor = RSSIngestor(source)
    elif platform == "telegram":
        from sentinel.ingestors.telegram import TelegramIngestor
        ingestor = TelegramIngestor(source)
    elif platform == "x":
        from sentinel.ingestors.x import XIngestor
        ingestor = XIngestor(source)
    elif platform == "bluesky":
        from sentinel.ingestors.bluesky import BlueskyIngestor
        ingestor = BlueskyIngestor(source)
    elif platform == "gdelt":
        if source["handle"].startswith("gdelt_gkg"):
            from sentinel.ingestors.gdelt import GdeltGkgIngestor
            ingestor = GdeltGkgIngestor(source)
        else:
            from sentinel.ingestors.gdelt import GdeltEventsIngestor
            ingestor = GdeltEventsIngestor(source)
    else:
        raise ValueError(f"Unknown platform: {platform!r}")

    posts = ingestor.fetch(since_hours=since_hours)
    new_ids: list[uuid.UUID] = []

    for post in posts:
        inserted_id = insert_raw_post(
            conn,
            source_id=source["id"],
            external_id=post["external_id"],
            posted_at=post["posted_at"],
            text=post["text"],
            media_urls=post.get("media_urls", []),
            archive_url=post.get("archive_url"),
            lang=post.get("lang"),
        )
        if inserted_id:
            new_ids.append(inserted_id)

    conn.commit()
    return new_ids
