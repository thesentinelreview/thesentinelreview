from __future__ import annotations

import uuid
from typing import Any

import structlog

from ..db import bulk_upsert_iocs, get_conn
from ..feeds import FEED_REGISTRY

log = structlog.get_logger()


def run_ioc_feed(conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
    handle = payload.get("handle")
    feed_id = uuid.UUID(payload["feed_id"]) if payload.get("feed_id") else None

    klass = FEED_REGISTRY.get(handle)
    if not klass:
        raise ValueError(f"Unknown feed handle: {handle}")

    feed = klass()
    iocs = feed.fetch(feed_id)
    count = bulk_upsert_iocs(conn, iocs)

    conn.execute(
        "UPDATE threat_feeds SET last_polled_at = now(), record_count = %s WHERE handle = %s",
        (count, handle),
    )
    log.info("ingest_feed.done", handle=handle, upserted=count)
    return {"handle": handle, "upserted": count}


def run_cve_feed(conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
    from ..feeds.nvd import NVDFeed
    feed = NVDFeed()
    since_days = payload.get("since_days", 1)
    count = feed.sync_cves(since_days=since_days)
    conn.execute("UPDATE threat_feeds SET last_polled_at = now() WHERE handle = 'nvd_cve'")
    log.info("ingest_cve.done", upserted=count)
    return {"upserted": count}


def run_mitre_sync(conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
    from ..feeds.mitre import MITREFeed
    feed = MITREFeed()
    count = feed.sync_techniques()
    conn.execute("UPDATE threat_feeds SET last_polled_at = now() WHERE handle = 'mitre_attack'")
    log.info("mitre_sync.done", upserted=count)
    return {"upserted": count}
