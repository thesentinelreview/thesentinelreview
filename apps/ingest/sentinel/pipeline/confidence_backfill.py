"""
One-shot, in-place confidence backfill (no LLM, no event merging/deleting).

Recomputes events.confidence deterministically and persists events.has_strong_signal
for rows that predate the persisted-signal fix (migration 0023). Repairs the legacy
inconsistency where a corroborated event was frozen at the confidence it had when
first created and never re-derived as later sources attached — so identical
2-source structures landed in all three confidence buckets.

How it recovers the (previously un-persisted) strong signal — by inverting the old
`classify` rule from each event's stored confidence + current source structure
(exact for every multi-source event):

    verified    -> has_strong_signal = true
    partial     -> has_strong_signal = (platform_count < 2)
    unconfirmed -> has_strong_signal = false

then recomputes confidence = classify(source_count, platform_count, min_trust_tier,
recovered_signal) and UPDATEs only `confidence` + `has_strong_signal`, only when a
value changes.

Safety:
  * Never manufactures `verified`: has_strong_signal=true is recovered only for
    events already `verified` or single-platform `partial`, and a single-platform
    event can never meet `verified`'s >=2-platform bar. So no unconfirmed/partial
    event is lifted to `verified` — the verified rate recovers FORWARD (as new
    cross-platform sources attach), not by rewriting history.
  * No-demote-verified guard: if the recompute would drop a stored `verified`, the
    row is SKIPPED (counted, not written). A demotion there means the stored data
    was already self-inconsistent (a `verified` event with <2 sources) — we report
    it rather than silently rewrite it.
  * It cannot recover a strong signal already collapsed into an `unconfirmed` event
    (the signal was never stored); those reach `verified` only forward.

Idempotent: a re-run recomputes to the same values and writes nothing.

Configured via env (safe by default — a bare run is a dry-run, no writes):
  SENTINEL_BACKFILL_DRYRUN     (default true)  — recompute + count only, NO writes
  SENTINEL_BACKFILL_BATCH_SIZE (default 500)   — events per DB roundtrip

Designed to run from GitHub Actions via the sentinel-backfill-confidence workflow,
but importable for local invocation or unit tests.
"""
from __future__ import annotations

import os
import uuid
from collections import Counter
from dataclasses import dataclass, field

import psycopg
import structlog

from sentinel.db import get_conn
from sentinel.pipeline.scorer import classify

log = structlog.get_logger()


@dataclass
class BackfillStats:
    """Summary of one confidence backfill run. Useful for tests and operator review."""
    considered:     int = 0   # events recomputed
    updated:        int = 0   # confidence changed and written (unless dry-run)
    signal_only:    int = 0   # has_strong_signal changed but confidence did not
    unchanged:      int = 0   # recompute matched the stored confidence + signal
    skipped_demote: int = 0   # would have demoted a stored `verified` — skipped, not written
    transitions:    Counter[str] = field(default_factory=Counter)  # "old->new" -> count
    dry_run:        bool = True


def recover_strong_signal(*, confidence: str, platform_count: int) -> bool:
    """Recover the (un-persisted) strong signal by inverting the old `classify` rule
    from an event's stored confidence + structure.

    Exact for every multi-source event. The only lossy case — a single-source
    `unconfirmed` event that genuinely carried a signal — recovers `False`, which
    never changes the static recompute (a lone source can't be verified/partial on
    counts), so it is safe and conservative.
    """
    if confidence == "verified":
        return True
    if confidence == "partial":
        return platform_count < 2
    return False  # unconfirmed


def _fetch_batch(
    conn: psycopg.Connection,
    *,
    batch_size: int,
    after_id: uuid.UUID | None,
) -> list[dict]:
    """Keyset-paginated by event id (which the backfill never mutates), so a long
    run processes each event exactly once even while committing between batches."""
    params: list[object] = []
    keyset_clause = ""
    if after_id is not None:
        keyset_clause = "WHERE e.id > %s"
        params.append(after_id)
    params.append(batch_size)
    sql = f"""
        SELECT
            e.id                         AS event_id,
            e.confidence                 AS confidence,
            e.has_strong_signal          AS has_strong_signal,
            COUNT(DISTINCT es.source_id) AS source_count,
            COUNT(DISTINCT s.platform)   AS platform_count,
            MIN(s.trust_tier)            AS min_trust_tier
        FROM events e
        LEFT JOIN event_sources es ON es.event_id = e.id
        LEFT JOIN sources s         ON s.id = es.source_id
        {keyset_clause}
        GROUP BY e.id, e.confidence, e.has_strong_signal
        ORDER BY e.id ASC
        LIMIT %s
    """
    return conn.execute(sql, tuple(params)).fetchall()  # type: ignore[return-value]


def _process_one(
    conn: psycopg.Connection,
    *,
    row: dict,
    stats: BackfillStats,
    dry_run: bool,
) -> None:
    """Recompute one event's confidence + has_strong_signal; write unless dry-run."""
    old_conf: str = row["confidence"]
    source_count: int = row["source_count"]
    platform_count: int = row["platform_count"]
    # A 0-source event (a referential-integrity violation that shouldn't exist) has
    # min_trust_tier NULL; coalesce to the lowest tier so classify stays total.
    min_trust_tier: int = row["min_trust_tier"] if row["min_trust_tier"] is not None else 3
    stored_signal: bool = row["has_strong_signal"]

    recovered = recover_strong_signal(confidence=old_conf, platform_count=platform_count)
    new_conf = classify(
        source_count=source_count,
        platform_count=platform_count,
        min_trust_tier=min_trust_tier,
        strong_signal=recovered,
    )

    # No-demote-verified guard — report inconsistency, don't rewrite it.
    if old_conf == "verified" and new_conf != "verified":
        stats.skipped_demote += 1
        log.warning(
            "confidence_backfill_skipped_would_demote_verified",
            event_id=str(row["event_id"]),
            new=new_conf,
            source_count=source_count,
            platform_count=platform_count,
        )
        return

    conf_changed = new_conf != old_conf
    signal_changed = recovered != stored_signal

    if conf_changed:
        stats.updated += 1
        stats.transitions[f"{old_conf}->{new_conf}"] += 1
    elif signal_changed:
        stats.signal_only += 1
    else:
        stats.unchanged += 1

    if not dry_run and (conf_changed or signal_changed):
        conn.execute(
            "UPDATE events SET confidence = %s, has_strong_signal = %s WHERE id = %s",
            (new_conf, recovered, row["event_id"]),
        )


def run_backfill(
    conn: psycopg.Connection | None = None,
    *,
    dry_run: bool | None = None,
    batch_size: int | None = None,
) -> BackfillStats:
    """Execute the backfill. If `conn` is None, opens its own connection.

    `dry_run` overrides SENTINEL_BACKFILL_DRYRUN when given (used by tests); when
    None the env-derived default applies (True — recompute + count, no writes).
    Returns BackfillStats so callers (the Actions wrapper, tests) can log the tally.
    """
    resolved_dry_run = (
        _env_bool("SENTINEL_BACKFILL_DRYRUN", default=True) if dry_run is None else dry_run
    )
    resolved_batch = (
        int(os.environ.get("SENTINEL_BACKFILL_BATCH_SIZE", "500"))
        if batch_size is None
        else batch_size
    )
    log.info("confidence_backfill_start", dry_run=resolved_dry_run, batch_size=resolved_batch)

    stats = BackfillStats(dry_run=resolved_dry_run)

    own_conn = conn is None
    if own_conn:
        conn_ctx = get_conn()
        conn = conn_ctx.__enter__()
    try:
        after_id: uuid.UUID | None = None
        while True:
            rows = _fetch_batch(conn, batch_size=resolved_batch, after_id=after_id)
            if not rows:
                break
            for row in rows:
                stats.considered += 1
                _process_one(conn, row=row, stats=stats, dry_run=resolved_dry_run)
            after_id = rows[-1]["event_id"]
            if not resolved_dry_run:
                conn.commit()
            log.info(
                "confidence_backfill_progress",
                considered=stats.considered,
                updated=stats.updated,
                signal_only=stats.signal_only,
                skipped_demote=stats.skipped_demote,
            )
    finally:
        if own_conn:
            conn_ctx.__exit__(None, None, None)  # type: ignore[union-attr]

    log.info(
        "confidence_backfill_complete",
        considered=stats.considered,
        updated=stats.updated,
        signal_only=stats.signal_only,
        unchanged=stats.unchanged,
        skipped_demote=stats.skipped_demote,
        transitions=dict(stats.transitions),
    )
    return stats


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")
