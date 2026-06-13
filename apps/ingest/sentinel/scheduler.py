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

import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone

import structlog

from sentinel.config import settings
from sentinel.db import enqueue, get_active_sources, get_conn

log = structlog.get_logger()

_INGEST_INTERVAL_MINUTES = 30   # poll each source every 30 minutes
_BRIEFING_HOUR_UTC = 6          # generate daily briefing at 06:00 UTC

# Error backoff: skip a repeatedly-failing source for a capped, exponentially
# growing window so a dead/403 feed isn't re-hammered every 30 min. Derived
# purely from the existing consecutive_errors + last_error_at columns — no new
# schema. Below the floor we still retry at full cadence (a transient blip or
# two shouldn't suppress a source); above it the window doubles per error up to
# the cap, so a persistently-broken feed settles into a ~daily retry.
_BACKOFF_FLOOR_ERRORS = 3
_BACKOFF_BASE_MINUTES = 30
_BACKOFF_CAP_MINUTES = 24 * 60


def _backoff_window(consecutive_errors: int) -> timedelta:
    """Capped exponential skip window for the current error streak. Pure — no
    DB — so it's unit-testable without Postgres."""
    if consecutive_errors < _BACKOFF_FLOOR_ERRORS:
        return timedelta(0)
    exp = min(consecutive_errors - _BACKOFF_FLOOR_ERRORS, 20)  # clamp before pow
    minutes = min(_BACKOFF_BASE_MINUTES * (2 ** exp), _BACKOFF_CAP_MINUTES)
    return timedelta(minutes=minutes)


def _should_skip_for_backoff(
    consecutive_errors: int, last_attempt_at: datetime | None, now: datetime
) -> bool:
    """True when a source is still inside its backoff window this cycle. Pure."""
    window = _backoff_window(consecutive_errors)
    if window <= timedelta(0) or last_attempt_at is None:
        return False
    return now - last_attempt_at < window

# Per-fetch look-back window. Widen it to 24h for tier-1/2 RSS feeds: low-frequency
# official feeds (ISW ~daily, COCOM press releases rarely) and slower news feeds
# (e.g. unian) routinely have nothing in a 2h window, so a narrow window starves
# them. Tier-3 (e.g. tass, very high volume) stays at 2h to avoid a large one-time
# backlog burst. Insert dedup on (source_id, external_id) makes wider re-pulls
# no-ops for posts already seen.
_DEFAULT_SINCE_HOURS = 2
_LOW_VOLUME_SINCE_HOURS = 24


def _since_hours_for(source: dict) -> int:
    tier = source.get("trust_tier")
    if source.get("platform") == "rss" and tier is not None and tier <= 2:
        return _LOW_VOLUME_SINCE_HOURS
    return _DEFAULT_SINCE_HOURS

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
    skipped_backoff = 0
    now = datetime.now(tz=timezone.utc)
    with get_conn() as conn:
        sources = get_active_sources(conn)
        for source in sources:
            platform = source["platform"]
            # Skip platforms whose credentials aren't configured
            if platform == "telegram" and not settings.telegram_enabled:
                continue
            if platform == "x" and not settings.x_enabled:
                continue
            if platform == "bluesky" and not (
                os.environ.get("BLUESKY_HANDLE") and os.environ.get("BLUESKY_APP_PASSWORD")
            ):
                continue

            # Error backoff: a repeatedly-failing source is skipped for a capped,
            # growing window. Logged with the streak and next-eligible time so a
            # quiet feed stays attributable rather than silently dropping out.
            consecutive_errors = int(source.get("consecutive_errors") or 0)
            last_attempt_at = source.get("last_error_at")
            if _should_skip_for_backoff(consecutive_errors, last_attempt_at, now):
                window = _backoff_window(consecutive_errors)
                next_eligible_at = last_attempt_at + window if last_attempt_at else now
                log.info(
                    "source_backoff_skip",
                    source=source["handle"],
                    consecutive_errors=consecutive_errors,
                    last_error_at=last_attempt_at.isoformat() if last_attempt_at else None,
                    next_eligible_at=next_eligible_at.isoformat(),
                    backoff_minutes=int(window.total_seconds() // 60),
                )
                skipped_backoff += 1
                continue

            enqueue(
                conn,
                "ingest_source",
                {"source_id": str(source["id"]), "since_hours": _since_hours_for(source)},
            )
            count += 1
    if skipped_backoff:
        log.info("ingest_backoff_skipped", skipped=skipped_backoff, enqueued=count)
    return count


_THEATERS = ["ukraine", "iran", "sudan", "myanmar", "israel", "russia", "nato_flank"]


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
