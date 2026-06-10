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
from datetime import datetime, timedelta

import psycopg


@dataclass
class CheckResult:
    name: str
    passed: bool
    severity: str   # "critical" | "warning"
    detail: str
    value: int      # raw numeric metric (count, age in minutes, etc.)


# Silence model, aligned with recompute_source_health()'s 14-day recency window
# (migration 0028). A source is "newly silent" only while it has just crossed
# the 14-day boundary — a transition, not a permanent state — so chronically
# silent feeds stop generating a per-run warning.
_SILENCE_DAYS = 14
_NEWLY_SILENT_BAND_DAYS = 1  # transition window after crossing the boundary


def _silence_state(last_post_at: datetime | None, now: datetime) -> str:
    """Bucket a source by last_post_at. Pure — unit-testable without Postgres.

      - 'never_posted'       : last_post_at is NULL (never produced a post)
      - 'healthy'            : posted within the last 14 days
      - 'newly_silent'       : crossed the 14-day boundary within the last ~1 day
      - 'chronically_silent' : silent well past 14 days (steady state)
    """
    if last_post_at is None:
        return "never_posted"
    age = now - last_post_at
    if age < timedelta(days=_SILENCE_DAYS):
        return "healthy"
    if age < timedelta(days=_SILENCE_DAYS + _NEWLY_SILENT_BAND_DAYS):
        return "newly_silent"
    return "chronically_silent"


def _classify_active_sources(conn: psycopg.Connection) -> list[tuple[str, str]]:
    """(handle, silence_state) for every active source, classified in Python so
    the decision logic stays pure. `now` comes from the DB clock to match
    last_post_at without host/DB skew."""
    now = conn.execute("SELECT now() AS now").fetchone()["now"]
    rows = conn.execute(
        "SELECT handle, last_post_at FROM sources WHERE is_active = true",
    ).fetchall()
    return [(r["handle"], _silence_state(r["last_post_at"], now)) for r in rows]


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


def check_stale_source_notes(conn: psycopg.Connection) -> CheckResult:
    """Active sources whose notes still carry a 'DEACTIVATED' tag — the note has
    drifted from is_active (e.g. gdelt_iran, reactivated by migration 0020 but
    left tagged DEACTIVATED). DETECTION ONLY (issue #217): reports the mismatch;
    note-correction writes are a separate, explicitly-approved action.
    """
    row = conn.execute(
        """
        SELECT COUNT(*) AS n,
               STRING_AGG(handle, ', ') AS handles
        FROM sources
        WHERE is_active = true
          AND notes ILIKE '%DEACTIVATED%'
        """,
    ).fetchone()
    count = row["n"] if row else 0
    handles = row["handles"] if row else None
    return CheckResult(
        name="stale_source_notes",
        passed=count == 0,
        severity="warning",
        detail=(
            f"{count} active source(s) tagged DEACTIVATED in notes (stale): {handles}"
            if count else "no active sources carry a stale DEACTIVATED note"
        ),
        value=count,
    )


def check_newly_silent_sources(conn: psycopg.Connection) -> CheckResult:
    """Active sources that have JUST gone silent — last_post_at crossed the
    14-day health boundary within the last ~1 day. A transition alert, not a
    level alarm: it fires while a source is newly dark and then self-clears, so
    a chronically-silent feed no longer warns on every run. (The long-running
    silent/never-posted clusters are tracked separately — see
    check_never_posted_sources — and via their own tickets.)"""
    newly = sorted(h for h, state in _classify_active_sources(conn) if state == "newly_silent")
    count = len(newly)
    return CheckResult(
        name="newly_silent_sources",
        passed=count == 0,
        severity="warning",
        detail=(
            f"{count} active source(s) newly silent (crossed the 14-day threshold): {', '.join(newly)}"
            if count else "no active sources newly crossed the 14-day silence threshold"
        ),
        value=count,
    )


def check_never_posted_sources(conn: psycopg.Connection) -> CheckResult:
    """Active sources that have NEVER produced a post (last_post_at IS NULL).

    Informational only (passed=True always): this is a chronic cluster with its
    own ticket, so it gets its own line for visibility rather than firing a
    warning every run."""
    never = sorted(h for h, state in _classify_active_sources(conn) if state == "never_posted")
    count = len(never)
    return CheckResult(
        name="never_posted_sources",
        passed=True,
        severity="warning",
        detail=(
            f"{count} active source(s) have never posted (informational): {', '.join(never)}"
            if count else "all active sources have posted at least once"
        ),
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
    check_newly_silent_sources,
    check_never_posted_sources,
    check_stale_source_notes,
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
