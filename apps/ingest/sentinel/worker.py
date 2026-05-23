"""Main worker loop. Polls the jobs table and dispatches to job handlers."""
from __future__ import annotations

import signal
import sys
import time
import uuid
from typing import NamedTuple

import structlog

from sentinel.config import settings
from sentinel.db import claim_job, complete_job, fail_job, get_conn

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Job handler registry
# ---------------------------------------------------------------------------

# Imported lazily to keep startup fast; handlers are only loaded when needed.
def _get_handler(job_type: str):  # type: ignore[return]
    if job_type == "ingest_source":
        from sentinel.jobs.ingest_source import run
        return run
    if job_type == "extract_events":
        from sentinel.jobs.extract_events import run
        return run
    if job_type == "generate_briefing":
        from sentinel.jobs.generate_briefing import run
        return run
    raise ValueError(f"Unknown job type: {job_type!r}")


# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(sig: int, frame: object) -> None:
    global _running
    log.info("shutdown_signal_received", signal=sig)
    _running = False


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------

class JobOutcome(NamedTuple):
    """Result of attempting one job. ``processed`` is False only when the queue
    was empty (no job claimed). On a handler exception ``failed`` is True and
    the exception type/message are captured so callers can report them without
    re-reading the jobs table."""

    processed: bool
    job_type: str | None = None
    source_id: str | None = None
    failed: bool = False
    error_type: str | None = None
    error: str | None = None


def _process_one() -> JobOutcome:
    """Claim and process one job. Returns a JobOutcome describing the result."""
    with get_conn() as conn:
        job = claim_job(conn)
        if job is None:
            return JobOutcome(processed=False)

    job_id: uuid.UUID = job["id"]
    job_type: str = job["job_type"]
    payload: dict = job["payload"]
    source_id = payload.get("source_id") if isinstance(payload, dict) else None

    log.info("job_started", job_id=str(job_id), job_type=job_type)

    try:
        handler = _get_handler(job_type)
        with get_conn() as conn:
            handler(conn, job_id=job_id, payload=payload)
        with get_conn() as conn:
            complete_job(conn, job_id)
        log.info("job_done", job_id=str(job_id), job_type=job_type)
    except Exception as exc:
        log.exception("job_failed", job_id=str(job_id), job_type=job_type, error=str(exc))
        with get_conn() as conn:
            fail_job(conn, job_id, str(exc))
        return JobOutcome(
            processed=True,
            job_type=job_type,
            source_id=str(source_id) if source_id else None,
            failed=True,
            error_type=type(exc).__name__,
            error=str(exc),
        )

    return JobOutcome(
        processed=True,
        job_type=job_type,
        source_id=str(source_id) if source_id else None,
        failed=False,
    )


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

    log.info("worker_starting", poll_interval=settings.worker_poll_interval)

    while _running:
        try:
            did_work = _process_one().processed
        except Exception as exc:
            log.exception("worker_loop_error", error=str(exc))
            did_work = False

        if not did_work:
            time.sleep(settings.worker_poll_interval)

    log.info("worker_stopped")


if __name__ == "__main__":
    main()
