"""
CLI entry points for Sentinel Shield workers.

  shield-worker       Run the job queue worker loop
  shield-scheduler    Enqueue recurring jobs
  shield-ingest       One-shot feed ingestion
"""

from __future__ import annotations

import sys
import uuid

import structlog

log = structlog.get_logger()


def worker() -> None:
    from .worker import run_loop
    run_loop()


def scheduler() -> None:
    """Enqueue periodic jobs for all active threat feeds."""
    import time
    from .db import enqueue, get_conn

    log.info("scheduler.started")
    while True:
        with get_conn() as conn:
            feeds = conn.execute(
                """
                SELECT id, handle, feed_type, poll_minutes, last_polled_at
                FROM threat_feeds WHERE is_active = true
                """,
            ).fetchall()

            for feed in feeds:
                handle = feed["handle"]
                feed_type = feed["feed_type"]
                last_polled = feed["last_polled_at"]
                poll_minutes = feed["poll_minutes"]

                import datetime
                now = datetime.datetime.now(datetime.timezone.utc)
                if last_polled and (now - last_polled).total_seconds() < poll_minutes * 60:
                    continue

                if feed_type == "cve_nvd":
                    enqueue(conn, "ingest_cve_feed", {"since_days": 1})
                    log.info("scheduler.enqueued", job="ingest_cve_feed")
                elif feed_type == "mitre_attack":
                    enqueue(conn, "sync_attack_framework", {})
                    log.info("scheduler.enqueued", job="sync_attack_framework")
                else:
                    enqueue(conn, "ingest_ioc_feed", {"handle": handle, "feed_id": str(feed["id"])})
                    log.info("scheduler.enqueued", job="ingest_ioc_feed", handle=handle)

            conn.commit()
        time.sleep(60)


def ingest() -> None:
    """One-shot: ingest all active IOC feeds immediately."""
    from .db import enqueue, get_conn

    with get_conn() as conn:
        feeds = conn.execute(
            "SELECT id, handle, feed_type FROM threat_feeds WHERE is_active = true"
        ).fetchall()
        for feed in feeds:
            if feed["feed_type"] not in ("cve_nvd", "mitre_attack"):
                enqueue(conn, "ingest_ioc_feed", {"handle": feed["handle"], "feed_id": str(feed["id"])})
        enqueue(conn, "ingest_cve_feed", {"since_days": 7})
        enqueue(conn, "sync_attack_framework", {})
        conn.commit()

    log.info("ingest.enqueued_all")
    # Run worker until queue empty
    from .worker import run_once
    while run_once():
        pass
