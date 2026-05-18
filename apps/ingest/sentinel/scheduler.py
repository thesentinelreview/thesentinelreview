"""
Scheduler — enqueues periodic ingest and briefing jobs.

Runs alongside the worker (in a separate process or container):

  sentinel-scheduler   # enqueues jobs
  sentinel-worker      # consumes jobs

Schedule:
  - ingest_source: every INGEST_INTERVAL_MINUTES minutes, for all active RSS sources.
    (Telegram and X sources are also enqueued when their credentials are configured.)
  - generate_briefing: once per day at BRIEFING_HOUR_UTC (default 06:00 UTC).
"""
from __future__ import annotations

import signal
import sys
import time
from datetime import datetime, timezone

import structlog

from sentinel.config import settings
from sentinel.db import enqueue, get_active_sources, get_conn

log = structlog.get_logger()

_INGEST_INTERVAL_MINUTES = 30   # poll each source every 30 minutes
_BRIEFING_HOUR_UTC = 6          # generate daily briefing at 06:00 UTC

_running = True


def _handle_signal(sig: int, frame: object) -> None:
    global _running
    log.info("shutdown_signal_received", signal=sig)
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)


def _enqueue_ingest_jobs() -> int:
    """Enqueue ingest_source jobs for all active sources. Returns count enqueued."""
    count = 0
    with get_conn() as conn:
        sources = get_active_sources(conn)
        for source in sources:
            platform = source["platform"]
            # Skip platforms whose credentials aren't configured
            if platform == "telegram" and not settings.telegram_enabled:
                continue
            if platform == "x" and not settings.x_enabled:
                continue
            enqueue(
                conn,
                "ingest_source",
                {"source_id": str(source["id"]), "since_hours": 2},
            )
            count += 1
    return count


_THEATERS = ["ukraine", "iran", "sudan", "myanmar"]


def _enqueue_briefing_job() -> None:
    with get_conn() as conn:
        for theater in _THEATERS:
            enqueue(conn, "generate_briefing", {"theater": theater, "period_hours": 24})


def _should_run_briefing(last_briefing_date: str | None) -> bool:
    now = datetime.now(tz=timezone.utc)
    today = now.strftime("%Y-%m-%d")
    return now.hour >= _BRIEFING_HOUR_UTC and last_briefing_date != today


def main() -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer() if sys.stderr.isatty()
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.BoundLogger,
        logger_factory=structlog.PrintLoggerFactory(),
    )

    log.info(
        "scheduler_starting",
        ingest_interval_minutes=_INGEST_INTERVAL_MINUTES,
        briefing_hour_utc=_BRIEFING_HOUR_UTC,
    )

    last_ingest_at: float = 0.0
    last_briefing_date: str | None = None

    while _running:
        now = time.monotonic()

        # Ingest: run every _INGEST_INTERVAL_MINUTES minutes
        if now - last_ingest_at >= _INGEST_INTERVAL_MINUTES * 60:
            try:
                count = _enqueue_ingest_jobs()
                log.info("ingest_jobs_enqueued", count=count)
            except Exception:
                log.exception("failed_to_enqueue_ingest_jobs")
            last_ingest_at = now

        # Briefing: once per day after _BRIEFING_HOUR_UTC
        if _should_run_briefing(last_briefing_date):
            try:
                _enqueue_briefing_job()
                last_briefing_date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
                log.info("briefing_job_enqueued", date=last_briefing_date)
            except Exception:
                log.exception("failed_to_enqueue_briefing_job")

        time.sleep(60)  # check every minute

    log.info("scheduler_stopped")


if __name__ == "__main__":
    main()
