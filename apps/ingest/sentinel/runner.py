"""One-shot entry points for GitHub Actions / cron environments.

Unlike the long-running worker and scheduler, these functions
enqueue jobs and drain the queue to completion, then exit.
"""
from __future__ import annotations

import json
import os
import smtplib
import sys
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING

import httpx
import structlog

if TYPE_CHECKING:
    from sentinel.checks import CheckResult

log = structlog.get_logger()


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.format_exc_info,
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


def run_backfill_translations() -> None:
    """One-shot backfill of raw_posts.translated_text for historical rows."""
    _configure_logging()
    from sentinel.pipeline.translation_backfill import run_backfill

    stats = run_backfill()
    print(
        f"\nBACKFILL: considered={stats.considered} "
        f"translated={stats.translated} skipped={stats.skipped} failed={stats.failed}",
        flush=True,
    )
    sys.exit(0)


def run_checks() -> None:
    """Run all data integrity checks; exit 1 if any critical check fails."""
    _configure_logging()
    from sentinel.checks import run_all_checks
    from sentinel.db import get_conn

    with get_conn() as conn:
        results = run_all_checks(conn)

    _print_check_results(results)

    critical_failures = [r for r in results if not r.passed and r.severity == "critical"]
    warnings = [r for r in results if not r.passed and r.severity == "warning"]

    log.info(
        "integrity_check_complete",
        total=len(results),
        passed=len([r for r in results if r.passed]),
        critical_failures=len(critical_failures),
        warnings=len(warnings),
    )

    if critical_failures:
        _maybe_send_webhook(critical_failures, warnings)
        _maybe_send_email(critical_failures, warnings)
        sys.exit(1)

    sys.exit(0)


def _print_check_results(results: list[CheckResult]) -> None:
    for r in results:
        if r.passed:
            symbol = "✓"
        elif r.severity == "critical":
            symbol = "✗"
        else:
            symbol = "!"
        suffix = f" — {r.severity.upper()}" if not r.passed else ""
        print(f"[{symbol}] {r.name}: {r.detail}{suffix}", flush=True)

    critical = sum(1 for r in results if not r.passed and r.severity == "critical")
    warn = sum(1 for r in results if not r.passed and r.severity == "warning")
    status = "FAILED" if critical else ("WARNINGS" if warn else "OK")
    print(f"\nRESULT: {status} — {critical} critical, {warn} warning(s)", flush=True)


def _maybe_send_webhook(
    critical_failures: list[CheckResult],
    warnings: list[CheckResult],
) -> None:
    url = os.environ.get("SENTINEL_ALERT_WEBHOOK_URL", "").strip()
    if not url:
        return

    lines = [f"• `{r.name}`: {r.detail}" for r in critical_failures]
    text = "*Critical:*\n" + "\n".join(lines)
    if warnings:
        warn_lines = [f"• `{r.name}`: {r.detail}" for r in warnings]
        text += "\n\n*Warnings:*\n" + "\n".join(warn_lines)

    payload = {
        "text": ":rotating_light: Sentinel integrity check FAILED",
        "blocks": [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": text},
            }
        ],
    }

    try:
        resp = httpx.post(url, content=json.dumps(payload), headers={"Content-Type": "application/json"}, timeout=10)
        resp.raise_for_status()
        log.info("webhook_sent", status=resp.status_code)
    except Exception as exc:
        log.warning("webhook_failed", error=str(exc))


def _maybe_send_email(
    critical_failures: list[CheckResult],
    warnings: list[CheckResult],
) -> None:
    to_addr = os.environ.get("ALERT_EMAIL", "").strip()
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    if not (to_addr and smtp_host and smtp_user and smtp_password):
        return

    try:
        smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    except ValueError:
        smtp_port = 587
    from_addr = os.environ.get("SMTP_FROM", smtp_user)
    now = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M UTC")

    subject = f"[Sentinel] Integrity check FAILED — {len(critical_failures)} critical failure(s)"

    lines = [
        f"Sentinel data integrity check failed at {now}.",
        "",
        "CRITICAL FAILURES:",
    ]
    for r in critical_failures:
        lines.append(f"  [✗] {r.name}: {r.detail}")

    if warnings:
        lines += ["", "WARNINGS:"]
        for r in warnings:
            lines.append(f"  [!] {r.name}: {r.detail}")

    lines += [
        "",
        "Check the GitHub Actions log for full details:",
        "https://github.com/thesentinelreview/thesentinelreview/actions",
    ]

    body = "\n".join(lines)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(smtp_user, smtp_password)
            smtp.sendmail(from_addr, to_addr, msg.as_string())
        log.info("alert_email_sent", to=to_addr)
    except Exception as exc:
        log.warning("alert_email_failed", error=str(exc))
