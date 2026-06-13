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
from typing import TYPE_CHECKING, Any, NamedTuple, cast

import httpx
import structlog

if TYPE_CHECKING:
    from sentinel.checks import CheckResult
    from sentinel.worker import JobOutcome

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


class _AllJobsFailed(RuntimeError):
    """Raised by _drain_queue when every job processed in a run raised."""

    def __init__(self, outcomes: list[JobOutcome]) -> None:
        self.outcomes = outcomes
        modes = sorted({f"{o.error_type}: {o.error}" for o in outcomes if o.failed})
        super().__init__(f"all {len(outcomes)} job(s) failed — " + " | ".join(modes))


def _drain_queue() -> list[JobOutcome]:
    """Process all ready jobs until the queue drains; return per-job outcomes.

    A failing *source* (handler exception) is recorded but does not stop the
    run: the worker marks its job failed/retry and draining continues to the
    next job. A failing *plumbing* call (claim/complete/fail) stops the drain
    so we don't spin in a hot loop. If every processed job failed, this raises
    _AllJobsFailed so the caller can surface a total wipeout loudly.
    """
    from sentinel.worker import JobOutcome, _process_one

    outcomes: list[JobOutcome] = []
    while True:
        try:
            outcome = _process_one()
        except Exception as exc:  # claim/complete/fail plumbing failure
            log.exception("drain_loop_error")
            outcomes.append(
                JobOutcome(
                    processed=True,
                    failed=True,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
            )
            break
        if not outcome.processed:
            break
        if outcome.failed:
            log.warning(
                "ingest_source_failed",
                job_type=outcome.job_type,
                source_id=outcome.source_id,
                error_type=outcome.error_type,
                error=outcome.error,
            )
        outcomes.append(outcome)

    processed = [o for o in outcomes if o.processed]
    if processed and all(o.failed for o in processed):
        raise _AllJobsFailed(processed)
    return outcomes


def _strict_mode_enabled() -> bool:
    """SENTINEL_STRICT_MODE kill-switch (default on). Set to a falsy value to
    let a zero-write run exit 0 — for debugging without alert fatigue."""
    return os.environ.get("SENTINEL_STRICT_MODE", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


class _RunSummary(NamedTuple):
    posts_written_total: int
    sources_attempted: int
    sources_succeeded: int
    sources_empty: int
    sources_failed_with_error: int


def _summarize(outcomes: list[JobOutcome], posts_by_source: dict[str, int]) -> _RunSummary:
    """Classify each attempted source as succeeded (wrote posts), empty (ran
    clean but wrote nothing), or failed (raised). A source that both failed and
    wrote posts counts as failed — the error is the signal worth surfacing."""
    ingest = [o for o in outcomes if o.job_type == "ingest_source"]
    attempted = {o.source_id for o in ingest if o.source_id}
    failed = {o.source_id for o in ingest if o.failed and o.source_id}
    succeeded = {s for s in attempted if s not in failed and posts_by_source.get(s, 0) > 0}
    empty = {s for s in attempted if s not in failed and posts_by_source.get(s, 0) == 0}
    return _RunSummary(
        posts_written_total=sum(posts_by_source.values()),
        sources_attempted=len(attempted),
        sources_succeeded=len(succeeded),
        sources_empty=len(empty),
        sources_failed_with_error=len(failed),
    )


def _db_now() -> datetime:
    """Server clock, so the run-start boundary matches raw_posts.ingested_at
    (also a DB now()) and we don't trip over host/DB clock skew."""
    from sentinel.db import get_conn

    with get_conn() as conn:
        row = conn.execute("SELECT now() AS now").fetchone()
    assert row is not None
    return cast("datetime", cast("dict[str, Any]", row)["now"])


def _posts_written_since(since: datetime) -> dict[str, int]:
    """raw_posts inserted at/after `since`, counted per source id (as str)."""
    from sentinel.db import get_conn

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT source_id, COUNT(*) AS n FROM raw_posts "
            "WHERE ingested_at >= %s GROUP BY source_id",
            (since,),
        ).fetchall()
    data = cast("list[dict[str, Any]]", rows)
    return {str(r["source_id"]): int(r["n"]) for r in data}


def run_ingest() -> None:
    """Enqueue all active-source ingest jobs, drain the queue, then report.

    Exits non-zero (in strict mode) when the run wrote zero raw_posts, so a
    silently-broken pipeline shows up as a failed workflow instead of green.
    """
    _configure_logging()
    from sentinel.jobs.ingest_source import drain_stamp_failures
    from sentinel.scheduler import _enqueue_ingest_jobs

    strict = _strict_mode_enabled()
    run_start = _db_now()

    enqueued = _enqueue_ingest_jobs()
    log.info("ingest_jobs_enqueued", count=enqueued)

    try:
        outcomes = _drain_queue()
    except _AllJobsFailed as exc:
        outcomes = exc.outcomes
        log.error("ingest_all_jobs_failed", error=str(exc))

    # Belt-and-suspenders bulk health reconcile alongside pg_cron (hourly).
    # Reconciles last_post_at from max(raw_posts.posted_at) for all sources,
    # then reclassifies health_status. Non-fatal: a failure here logs a warning
    # but never aborts the ingest run.
    try:
        from sentinel.db import get_conn
        with get_conn() as conn:
            conn.execute("SELECT recompute_source_health()")
        log.info("health_recompute_bulk")
    except Exception:
        log.warning("health_recompute_bulk_failed")

    posts_by_source = _posts_written_since(run_start)
    summary = _summarize(outcomes, posts_by_source)

    # Health stamps are isolated from the post inserts (a stamp failure never
    # rolls back ingested posts), so a persistent stamp failure would otherwise
    # vanish into a warning log. Surface it as a structured line in the run
    # summary — visible, but never aborting other sources.
    stamp_failures = drain_stamp_failures()
    if stamp_failures:
        log.error(
            "ingest_stamp_failures",
            count=len(stamp_failures),
            sources=[h for h, _ in stamp_failures],
            errors=[f"{h}: {e}" for h, e in stamp_failures],
        )

    log.info(
        "ingest_complete",
        posts_written_total=summary.posts_written_total,
        sources_succeeded=summary.sources_succeeded,
        sources_empty=summary.sources_empty,
        sources_failed_with_error=summary.sources_failed_with_error,
        sources_stamp_failed=len(stamp_failures),
        jobs_enqueued=enqueued,
        jobs_processed=len(outcomes),
        strict_mode=strict,
    )

    if summary.posts_written_total == 0:
        log.error(
            "ingest_zero_write",
            jobs_enqueued=enqueued,
            sources_attempted=summary.sources_attempted,
            sources_failed_with_error=summary.sources_failed_with_error,
            strict_mode=strict,
        )
        if strict:
            sys.exit(1)

    sys.exit(0)


def _drain_max_posts() -> int | None:
    """Per-run cap on posts pulled into the extraction drain.

    SENTINEL_DRAIN_MAX_POSTS <= 0 (or unparseable) means no cap — drain
    everything in one run. Default 250 keeps a single run bounded.
    """
    raw = os.environ.get("SENTINEL_DRAIN_MAX_POSTS", "250").strip()
    try:
        n = int(raw)
    except ValueError:
        return 250
    return None if n <= 0 else n


def run_drain_extraction() -> None:
    """One-shot: run the real extractor over raw_posts that were never enqueued.

    Steady-state extraction is id-driven — ingest_source enqueues extract_events
    for the ids it just inserted — so posts written by other means (e.g. the
    Neon->Supabase backfill) are never picked up. This selects unprocessed posts
    directly (processed_at IS NULL AND skip_reason IS NULL), oldest-first, up to
    a per-run cap, groups them by source, and drives the unchanged extract_events
    path (translate -> extract -> future-date clamp -> dedup -> score -> insert),
    creating real events / event_sources / llm_logs. Re-run until the unprocessed
    count trends to ~0. Idempotent: each post is marked processed (or
    skip_reason'd), so a re-run never reprocesses one.
    """
    _configure_logging()
    from collections import defaultdict

    from sentinel.config import settings
    from sentinel.db import enqueue, get_conn, get_unprocessed_post_ids

    cap = _drain_max_posts()

    def _counts() -> tuple[int, int]:
        with get_conn() as conn:
            unprocessed = conn.execute(
                "SELECT count(*) AS n FROM raw_posts "
                "WHERE processed_at IS NULL AND skip_reason IS NULL"
            ).fetchone()["n"]
            events = conn.execute("SELECT count(*) AS n FROM events").fetchone()["n"]
        return int(unprocessed), int(events)

    unprocessed_before, events_before = _counts()

    with get_conn() as conn:
        rows = get_unprocessed_post_ids(conn, limit=cap)

    by_source: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        by_source[str(row["source_id"])].append(str(row["id"]))

    batch_size = settings.worker_batch_size
    enqueued = 0
    with get_conn() as conn:
        for source_id, ids in by_source.items():
            for i in range(0, len(ids), batch_size):
                enqueue(
                    conn,
                    "extract_events",
                    {"raw_post_ids": ids[i : i + batch_size], "source_id": source_id},
                )
                enqueued += 1

    log.info(
        "drain_enqueued",
        selected_posts=len(rows),
        sources=len(by_source),
        extract_jobs=enqueued,
        unprocessed_before=unprocessed_before,
        cap=cap or 0,
    )

    all_failed = False
    try:
        outcomes = _drain_queue()
    except _AllJobsFailed as exc:
        outcomes = exc.outcomes
        all_failed = True
        log.error("drain_all_jobs_failed", error=str(exc))

    unprocessed_after, events_after = _counts()
    jobs_failed = sum(1 for o in outcomes if o.failed)

    log.info(
        "drain_complete",
        selected_posts=len(rows),
        jobs_processed=len(outcomes),
        jobs_failed=jobs_failed,
        unprocessed_before=unprocessed_before,
        unprocessed_after=unprocessed_after,
        drained=unprocessed_before - unprocessed_after,
        events_created=events_after - events_before,
    )
    print(
        f"\nDRAIN: selected={len(rows)} sources={len(by_source)} extract_jobs={enqueued} "
        f"jobs_failed={jobs_failed} | unprocessed {unprocessed_before}->{unprocessed_after} "
        f"(drained {unprocessed_before - unprocessed_after}) | "
        f"events {events_before}->{events_after} (+{events_after - events_before})",
        flush=True,
    )
    sys.exit(1 if all_failed else 0)


def run_probe_feeds() -> None:
    """One-shot, read-only probe of candidate RSS URLs (Phase C URL discovery).

    Fetches the candidate feed URLs from the Actions runner's egress and records
    HTTP status / content-type / parse / entry count to the feed_probe_results
    scratch table for review. Read-only w.r.t. sources; no drain/extraction.
    """
    _configure_logging()
    from sentinel.probe_feeds import run

    run()


def run_briefing() -> None:
    """Enqueue and process today's daily briefing."""
    _configure_logging()
    from sentinel.scheduler import _enqueue_briefing_job

    _enqueue_briefing_job()
    log.info("briefing_job_enqueued")
    try:
        outcomes = _drain_queue()
    except _AllJobsFailed as exc:
        log.error("briefing_all_jobs_failed", error=str(exc))
        sys.exit(1)
    log.info("briefing_complete", jobs_processed=len(outcomes))
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


def run_dryrun_weapon_type() -> None:
    """One-shot dry-run of the weapon_type classifier (PR 1 verification gate).

    Read-only: prints a per-theater distribution + sample classifications. Always
    exits 0 — the report is the deliverable; the operator decides on the merge gate.
    """
    _configure_logging()
    from sentinel.pipeline.weapon_type_dryrun import run_dryrun

    results = run_dryrun()
    worst = max((r.null_pct for r in results if r.events), default=0.0)
    tally = " ".join(f"{r.theater}={r.events}ev/{r.null_pct:.0f}%null" for r in results)
    print(f"\nWEAPON DRY-RUN: {tally} | worst_null={worst:.0f}%", flush=True)
    sys.exit(0)


def run_backfill_weapon_type() -> None:
    """One-shot backfill of events.weapon_type for historical rows (Threat Axes PR 2).

    Re-runs the live extractor on each unclassified event's primary source post and
    persists the resulting weapon_type. Always exits 0 — the tally is the deliverable.
    """
    _configure_logging()
    from sentinel.pipeline.weapon_type_backfill import run_backfill

    stats = run_backfill()
    mode = "DRY-RUN — no writes" if stats.dry_run else "COMMIT"
    dist = " ".join(f"{k}={v}" for k, v in sorted(stats.dist.items())) or "—"
    print(
        f"\nWEAPON BACKFILL [{mode}]: considered={stats.considered} classified={stats.classified} "
        f"null={stats.null} no_event={stats.no_event} failed={stats.failed} | dist: {dist}",
        flush=True,
    )
    sys.exit(0)


def run_backfill_confidence() -> None:
    """One-shot, in-place confidence backfill (no LLM): recompute events.confidence
    and persist events.has_strong_signal, repairing the legacy inconsistency where
    corroborated events were frozen at their creation-time confidence.

    Always exits 0 — the tally is the deliverable. A bare run is a dry-run; the
    operator reviews it (in particular skipped_demote should be 0) and commits by
    re-running with SENTINEL_BACKFILL_DRYRUN=false.
    """
    _configure_logging()
    from sentinel.pipeline.confidence_backfill import run_backfill

    stats = run_backfill()
    mode = "DRY-RUN — no writes" if stats.dry_run else "COMMIT"
    transitions = " ".join(f"{k}={v}" for k, v in sorted(stats.transitions.items())) or "—"
    print(
        f"\nCONFIDENCE BACKFILL [{mode}]: considered={stats.considered} updated={stats.updated} "
        f"signal_only={stats.signal_only} unchanged={stats.unchanged} "
        f"skipped_demote={stats.skipped_demote} | transitions: {transitions}",
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
