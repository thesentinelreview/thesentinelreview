"""
Data integrity checks.

Each function takes a psycopg.Connection and returns a CheckResult.
run_all_checks() executes all of them in order.

Severity:
  critical — exit 1 on failure; triggers GH Actions failure email
  warning  — logged and reported to webhook but does not fail the run
"""
from __future__ import annotations

from dataclasses import dataclass

import psycopg


@dataclass
class CheckResult:
    name: str
    passed: bool
    severity: str   # "critical" | "warning"
    detail: str
    value: int      # raw numeric metric (count, age in minutes, etc.)


# ---------------------------------------------------------------------------
# Critical checks
# ---------------------------------------------------------------------------

def check_stuck_running_jobs(conn: psycopg.Connection) -> CheckResult:
    """Jobs stuck in 'running' for >30 min indicate a crashed worker."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM jobs
        WHERE status = 'running'
          AND started_at < now() - interval '30 minutes'
        """,
    ).fetchone()
    count = row["n"] if row else 0
    return CheckResult(
        name="stuck_running_jobs",
        passed=count == 0,
        severity="critical",
        detail=f"{count} job(s) stuck in 'running' for >30 min" if count else "0 stuck jobs",
        value=count,
    )


def check_failed_jobs_24h(conn: psycopg.Connection) -> CheckResult:
    """Jobs permanently failed (exhausted retries) in the last 24 hours."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n,
               STRING_AGG(DISTINCT job_type, ', ') AS types
        FROM jobs
        WHERE status = 'failed'
          AND created_at > now() - interval '24 hours'
        """,
    ).fetchone()
    count = row["n"] if row else 0
    types = row["types"] if row else None
    detail = (
        f"{count} job(s) permanently failed in last 24h (types: {types})"
        if count else "0 failed jobs in last 24h"
    )
    return CheckResult(
        name="failed_jobs_24h",
        passed=count == 0,
        severity="critical",
        detail=detail,
        value=count,
    )


def check_no_published_events_48h(conn: psycopg.Connection) -> CheckResult:
    """No published event in the last 48 hours — pipeline has stopped producing output."""
    row = conn.execute(
        """
        SELECT EXTRACT(EPOCH FROM (now() - MAX(published_at))) / 60 AS age_minutes
        FROM events
        WHERE published_at IS NOT NULL
        """,
    ).fetchone()
    age = int(row["age_minutes"]) if row and row["age_minutes"] is not None else 99999
    threshold = 48 * 60  # 48 hours in minutes
    passed = age < threshold
    if age >= 99999:
        detail = "no published events found at all"
    elif passed:
        detail = f"last published event {age} min ago"
    else:
        detail = f"last published event {age} min ago — exceeds 48h threshold"
    return CheckResult(
        name="no_published_events_48h",
        passed=passed,
        severity="critical",
        detail=detail,
        value=age,
    )


def check_orphaned_published(conn: psycopg.Connection) -> CheckResult:
    """Events with published_at=NULL and held_for_review=false — should be impossible post-migration-0005."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM events
        WHERE published_at IS NULL
          AND held_for_review = false
        """,
    ).fetchone()
    count = row["n"] if row else 0
    return CheckResult(
        name="orphaned_published",
        passed=count == 0,
        severity="critical",
        detail=f"{count} event(s) are not held but have NULL published_at" if count else "all non-held events have published_at",
        value=count,
    )


def check_future_occurred_at(conn: psycopg.Connection) -> CheckResult:
    """Events with occurred_at more than 1h in the future — LLM date extraction error.

    Backstop only: the primary guard is the write-time clamp in
    sentinel.jobs.extract_events._clamp_future_occurred_at. A single mis-dated
    row that slips past the clamp isn't worth halting the pipeline over.
    """
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM events
        WHERE occurred_at > now() + interval '1 hour'
        """,
    ).fetchone()
    count = row["n"] if row else 0
    return CheckResult(
        name="future_occurred_at",
        passed=count == 0,
        severity="warning",
        detail=f"{count} event(s) have occurred_at in the future" if count else "no events with future timestamps",
        value=count,
    )


# ---------------------------------------------------------------------------
# Warning checks
# ---------------------------------------------------------------------------

def check_unprocessed_posts_old(conn: psycopg.Connection) -> CheckResult:
    """Raw posts ingested >2h ago that are still unprocessed — extraction queue stuck."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM raw_posts
        WHERE processed_at IS NULL
          AND skip_reason IS NULL
          AND ingested_at < now() - interval '2 hours'
        """,
    ).fetchone()
    count = row["n"] if row else 0
    return CheckResult(
        name="unprocessed_posts_old",
        passed=count == 0,
        severity="warning",
        detail=f"{count} post(s) unprocessed for >2h" if count else "no stale unprocessed posts",
        value=count,
    )


def check_high_skip_rate_24h(conn: psycopg.Connection) -> CheckResult:
    """Extraction skip rate >75% in last 24h suggests LLM prompt or source quality issue."""
    row = conn.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE processed_at IS NOT NULL) AS processed,
            COUNT(*) FILTER (WHERE skip_reason IS NOT NULL)  AS skipped
        FROM raw_posts
        WHERE ingested_at > now() - interval '24 hours'
        """,
    ).fetchone()
    processed = row["processed"] if row else 0
    skipped = row["skipped"] if row else 0
    if processed == 0:
        return CheckResult(
            name="high_skip_rate_24h",
            passed=True,
            severity="warning",
            detail="no posts processed in last 24h (nothing to measure)",
            value=0,
        )
    skip_pct = int(100 * skipped / processed) if processed else 0
    passed = skip_pct <= 75
    return CheckResult(
        name="high_skip_rate_24h",
        passed=passed,
        severity="warning",
        detail=f"{skip_pct}% skip rate ({skipped}/{processed} posts in last 24h)",
        value=skip_pct,
    )


def check_no_published_events_8h(conn: psycopg.Connection) -> CheckResult:
    """Early warning: no published event in the last 8 hours."""
    row = conn.execute(
        """
        SELECT EXTRACT(EPOCH FROM (now() - MAX(published_at))) / 60 AS age_minutes
        FROM events
        WHERE published_at IS NOT NULL
        """,
    ).fetchone()
    age = int(row["age_minutes"]) if row and row["age_minutes"] is not None else 99999
    threshold = 8 * 60
    passed = age < threshold
    if age >= 99999:
        detail = "no published events found at all"
    elif passed:
        detail = f"last published event {age} min ago"
    else:
        detail = f"last published event {age} min ago — exceeds 8h threshold"
    return CheckResult(
        name="no_published_events_8h",
        passed=passed,
        severity="warning",
        detail=detail,
        value=age,
    )


def check_held_events(conn: psycopg.Connection) -> CheckResult:
    """Any held_for_review event is a policy violation — dashboard runs autonomously."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM events
        WHERE held_for_review = true
        """,
    ).fetchone()
    count = row["n"] if row else 0
    return CheckResult(
        name="held_events",
        passed=count == 0,
        severity="warning",
        detail=f"{count} event(s) still held for review (should be 0 — run migration 0007)" if count else "no events held for review",
        value=count,
    )


def check_silent_active_sources(conn: psycopg.Connection) -> CheckResult:
    """Active sources with zero new posts in the last 72h — ingestor may have failed for them."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM sources s
        WHERE s.is_active = true
          AND NOT EXISTS (
              SELECT 1 FROM raw_posts rp
              WHERE rp.source_id = s.id
                AND rp.ingested_at > now() - interval '72 hours'
          )
        """,
    ).fetchone()
    count = row["n"] if row else 0
    threshold = 5
    passed = count <= threshold
    return CheckResult(
        name="silent_active_sources",
        passed=passed,
        severity="warning",
        detail=f"{count} active source(s) produced no posts in last 72h" if count else "all active sources have recent posts",
        value=count,
    )


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

_ALL_CHECKS = [
    # Critical first
    check_stuck_running_jobs,
    check_failed_jobs_24h,
    check_no_published_events_48h,
    check_orphaned_published,
    check_future_occurred_at,
    # Warnings
    check_unprocessed_posts_old,
    check_high_skip_rate_24h,
    check_no_published_events_8h,
    check_held_events,
    check_silent_active_sources,
]


def run_all_checks(conn: psycopg.Connection) -> list[CheckResult]:
    results = []
    for fn in _ALL_CHECKS:
        try:
            results.append(fn(conn))
        except Exception as exc:
            results.append(CheckResult(
                name=fn.__name__.removeprefix("check_"),
                passed=False,
                severity="critical",
                detail=f"check raised exception: {exc}",
                value=-1,
            ))
    return results
