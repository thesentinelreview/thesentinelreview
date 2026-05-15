from __future__ import annotations

import time
import uuid
from typing import Any, Callable

import structlog

from .config import settings
from .db import claim_job, complete_job, fail_job, get_conn

log = structlog.get_logger()


def _get_handler(job_type: str) -> Callable[..., Any]:
    if job_type == "correlate_events":
        from .detection.correlator import run
        return run
    if job_type == "triage_alert":
        from .ai.triage import triage_alert
        def _triage(conn: Any, payload: dict[str, Any]) -> Any:
            return triage_alert(uuid.UUID(payload["alert_id"]))
        return _triage
    if job_type == "investigate_incident":
        from .ai.investigate import investigate_incident
        def _investigate(conn: Any, payload: dict[str, Any]) -> Any:
            return investigate_incident(
                uuid.UUID(payload["alert_id"]),
                uuid.UUID(payload["asset_id"]) if payload.get("asset_id") else None,
            )
        return _investigate
    if job_type == "ingest_ioc_feed":
        from .jobs.ingest_feed import run_ioc_feed
        return run_ioc_feed
    if job_type == "ingest_cve_feed":
        from .jobs.ingest_feed import run_cve_feed
        return run_cve_feed
    if job_type == "sync_attack_framework":
        from .jobs.ingest_feed import run_mitre_sync
        return run_mitre_sync
    if job_type == "update_baselines":
        from .jobs.update_baselines import run
        return run
    raise ValueError(f"Unknown job type: {job_type}")


def run_once() -> bool:
    """Process one job. Returns True if a job was processed."""
    with get_conn() as conn:
        job = claim_job(conn)
        if not job:
            return False

        job_id = job["id"]
        job_type = job["job_type"]
        payload = job["payload"]
        log.info("worker.processing", job_id=str(job_id), job_type=job_type)

        try:
            handler = _get_handler(job_type)
            result = handler(conn, payload)
            complete_job(conn, job_id)
            conn.commit()
            log.info("worker.done", job_id=str(job_id), result=result)
            return True
        except Exception as exc:
            log.exception("worker.failed", job_id=str(job_id), error=str(exc))
            fail_job(conn, job_id, str(exc))
            conn.commit()
            return True


def run_loop() -> None:
    log.info("worker.started", poll_interval=settings.worker_poll_interval)
    while True:
        processed = run_once()
        if not processed:
            time.sleep(settings.worker_poll_interval)
