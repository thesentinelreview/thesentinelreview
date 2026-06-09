"""
DRAFT — theater relabel for sources (NOT to be run in the theater-integrity ticket).

Background
----------
Events carry no `theater` column — an event's theater is derived at read time from
its coordinates against the per-theater bounding boxes (see db._THEATER_BBOX and
apps/web/lib/queries.ts). So once the `israel` box ships, every historical
Israel/Gaza/West Bank event that used to render under `iran` re-buckets to
`israel` automatically — there is nothing to relabel at the event level.

What DOES need a deliberate, reviewed relabel is `sources.theaters`: sources that
were tagged `iran` purely to cover Israel/Gaza content should be re-tagged
`israel` (or have it added) so the source-scoped surfaces — sensor strip,
firehose, admin source assignment — and the router's per-source prior hint line
up with the new theater. That is editorial, so it is intentionally driven by a
curated mapping the maintainer fills in AFTER reviewing the audit numbers, not by
a heuristic.

Per the ticket, relabeling executes in a FOLLOW-UP ticket. This file is a draft:
a bare run is a read-only dry-run that prints the proposed changes and the
event-level impact; it writes nothing unless explicitly executed with a
non-empty mapping.

Usage (follow-up ticket only)
-----------------------------
    # read-only report + dry-run of the curated mapping (default):
    python -m sentinel.pipeline.theater_relabel

    # actually apply (only after REASSIGN is filled in and reviewed):
    SENTINEL_RELABEL_EXECUTE=true python -m sentinel.pipeline.theater_relabel

Safety
------
  * Dry-run by default. Writes only when SENTINEL_RELABEL_EXECUTE=true.
  * Refuses to run against any DB whose host is not Supabase (never Neon).
  * Writes only sources.theaters, and only for handles in REASSIGN, and only
    values in the canonical theater set. Never touches events.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlparse

import structlog

from sentinel.db import _ISRAEL_BBOX, get_conn

log = structlog.get_logger()

# Canonical, storable theater set (mirrors migration 0029 / theater_router.THEATERS,
# excluding the 'unknown' extraction-scope sentinel which is never stored).
CANONICAL_THEATERS = ("ukraine", "iran", "sudan", "myanmar", "israel")

_EXPECTED_DB_HOST_SUBSTRING = "supabase.co"

# ---------------------------------------------------------------------------
# Curated mapping — FILL IN during the follow-up ticket after reviewing the audit.
# Maps a source.handle to the FULL desired theaters list (the script replaces the
# array wholesale, so include every theater the source should keep). Empty here on
# purpose: with no entries the script only reports and never writes.
#
# Example (do not assume — confirm against the report output first):
#   REASSIGN = {
#       "some_idf_handle":      ["israel"],
#       "a_dual_coverage_feed": ["iran", "israel"],
#   }
# ---------------------------------------------------------------------------
REASSIGN: dict[str, list[str]] = {}


@dataclass
class RelabelStats:
    candidates: int = 0      # iran-tagged sources inspected
    planned: int = 0         # sources whose theaters would change
    applied: int = 0         # sources actually updated (0 unless executed)
    skipped_invalid: int = 0  # REASSIGN entries with a non-canonical theater
    dry_run: bool = True
    notes: list[str] = field(default_factory=list)


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _assert_supabase() -> None:
    """Never relabel anything but the canonical Supabase DB."""
    url = os.environ.get("DATABASE_URL", "").strip()
    host = urlparse(url).hostname or ""
    if _EXPECTED_DB_HOST_SUBSTRING not in host:
        raise SystemExit(
            f"refusing to run: DATABASE_URL host {host!r} is not Supabase "
            f"(expected substring {_EXPECTED_DB_HOST_SUBSTRING!r})"
        )


def _report_iran_sources(conn) -> list[dict]:
    """Read-only: every source tagged iran, with how many of its linked events
    fall in the israel homeland box — the signal for whether it should move."""
    a, b, c, d = _ISRAEL_BBOX
    rows = conn.execute(
        """
        SELECT
            s.handle,
            s.theaters,
            count(DISTINCT es.event_id) AS total_events,
            count(DISTINCT es.event_id) FILTER (
                WHERE ST_Within(e.location, ST_MakeEnvelope(%s, %s, %s, %s, 4326))
            ) AS israel_box_events
        FROM sources s
        LEFT JOIN event_sources es ON es.source_id = s.id
        LEFT JOIN events e         ON e.id = es.event_id
        WHERE 'iran' = ANY(s.theaters)
        GROUP BY s.handle, s.theaters
        ORDER BY israel_box_events DESC, total_events DESC
        """,
        (a, b, c, d),
    ).fetchall()
    return rows  # type: ignore[return-value]


def run(*, execute: bool | None = None) -> RelabelStats:
    _assert_supabase()

    # Writing is strictly opt-in: a bare run (no SENTINEL_RELABEL_EXECUTE) is a
    # read-only report + dry-run that prints planned changes but writes nothing.
    if execute is None:
        execute = _env_bool("SENTINEL_RELABEL_EXECUTE", default=False)
    do_write = execute

    stats = RelabelStats(dry_run=not do_write)

    with get_conn() as conn:
        # 1. Read-only report to guide curation.
        report = _report_iran_sources(conn)
        stats.candidates = len(report)
        for r in report:
            log.info(
                "iran_source",
                handle=r["handle"],
                theaters=r["theaters"],
                total_events=r["total_events"],
                israel_box_events=r["israel_box_events"],
            )

        # 2. Validate + apply the curated mapping.
        if not REASSIGN:
            stats.notes.append(
                "REASSIGN is empty — report only, nothing to relabel. Fill it in "
                "(follow-up ticket) after reviewing the iran_source report above."
            )
            log.warning("relabel_noop_empty_mapping")
            return stats

        for handle, new_theaters in REASSIGN.items():
            invalid = [t for t in new_theaters if t not in CANONICAL_THEATERS]
            if invalid or not new_theaters:
                stats.skipped_invalid += 1
                log.error("relabel_invalid_target", handle=handle, theaters=new_theaters, invalid=invalid)
                continue

            current = conn.execute(
                "SELECT theaters FROM sources WHERE handle = %s", (handle,)
            ).fetchone()
            if current is None:
                log.error("relabel_unknown_handle", handle=handle)
                continue
            if list(current["theaters"]) == list(new_theaters):
                continue  # already correct

            stats.planned += 1
            if not do_write:
                log.info("relabel_planned", handle=handle, current=current["theaters"], new=new_theaters)
                continue

            conn.execute(
                "UPDATE sources SET theaters = %s WHERE handle = %s",
                (new_theaters, handle),
            )
            stats.applied += 1
            log.info("relabel_applied", handle=handle, current=current["theaters"], new=new_theaters)

        if do_write:
            conn.commit()

    log.info(
        "relabel_done",
        dry_run=stats.dry_run,
        candidates=stats.candidates,
        planned=stats.planned,
        applied=stats.applied,
        skipped_invalid=stats.skipped_invalid,
    )
    return stats


if __name__ == "__main__":
    run()
