"""One-shot entry points for GitHub Actions / cron environments.

Unlike the long-running worker and scheduler, these functions
enqueue jobs and drain the queue to completion, then exit.
"""
from __future__ import annotations

import sys

import structlog

log = structlog.get_logger()


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.BoundLogger,
        logger_factory=structlog.PrintLoggerFactory(),
    )


def _drain_queue() -> int:
    """Process all pending jobs until queue empty. Returns jobs processed."""
    from sentinel.worker import _process_one

    count = 0
    while True:
        try:
            did_work = _process_one()
        except Exception:
            log.exception("job_error")
            did_work = False
        if not did_work:
            break
        count += 1
    return count


def run_ingest() -> None:
    """Enqueue all active-source ingest jobs then process until queue empty."""
    _configure_logging()
    from sentinel.scheduler import _enqueue_ingest_jobs

    count = _enqueue_ingest_jobs()
    log.info("ingest_jobs_enqueued", count=count)
    processed = _drain_queue()
    log.info("ingest_complete", jobs_processed=processed)
    sys.exit(0)


def run_briefing() -> None:
    """Enqueue and process today's daily briefing."""
    _configure_logging()
    from sentinel.scheduler import _enqueue_briefing_job

    _enqueue_briefing_job()
    log.info("briefing_job_enqueued")
    processed = _drain_queue()
    log.info("briefing_complete", jobs_processed=processed)
    sys.exit(0)
