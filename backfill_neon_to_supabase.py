#!/usr/bin/env python3
"""One-shot backfill: copy orphaned raw_posts from a frozen pre-migration Neon
project into the live Supabase production database.

Context
-------
During ~2026-05-17..05-26 a mis-pointed GitHub Actions ``DATABASE_URL`` secret
wrote ingested posts to a now-frozen Neon project ("Sentinel Dashboard",
``ep-empty-leaf-ap4p0pzo``) instead of the live Supabase DB. That project holds
raw_posts the canonical pipeline never captured and that exist nowhere else.
This script copies them into Supabase so the normal extractor turns them into
events. It is meant to be run once (then re-run with apply=true) and then never
again — the Neon project will be deleted afterwards.

Guarantees
----------
* DRY-RUN by default: prints the *exact* would-insert count and writes nothing.
  Set ``APPLY=true`` to actually commit.
* ``source_id`` is remapped Neon -> Supabase by joining on ``sources.handle``
  (the source UUIDs differ between the two databases; the handles do not).
* ``INSERT ... ON CONFLICT (source_id, external_id) DO NOTHING`` — never touches
  or overwrites an existing row; a re-run inserts 0.
* New rows land with ``processed_at = NULL`` so the normal extractor picks them
  up (it selects on the ``WHERE processed_at IS NULL`` partial index).
* ``posted_at`` / ``ingested_at`` are preserved as-is.
* Aborts unless the write target is a Supabase host, and refuses a self-copy.

Environment
-----------
NEON_URL      source (frozen Neon) connection string        [required]
SUPABASE_URL  destination (live Supabase) connection string  [required]
APPLY         "true" to write; anything else means dry run   [default: false]
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from urllib.parse import urlparse

import psycopg

# Columns copied verbatim Neon -> Supabase. ``source_id`` is remapped by handle
# before insert; ``processed_at`` is forced NULL (see INSERT below). The newer
# columns (translated_text, skip_reason) are intentionally not copied — they
# default to NULL, which is the correct "not yet processed" state.
CARRIED_COLUMNS = [
    "id",
    "source_id",
    "external_id",
    "posted_at",
    "text",
    "media_urls",
    "archive_url",
    "lang",
    "ingested_at",
]
SOURCE_ID_IDX = CARRIED_COLUMNS.index("source_id")
EXTERNAL_ID_IDX = CARRIED_COLUMNS.index("external_id")

# Expected (data_type, udt_name) per information_schema.columns for each carried
# column. Checked against the live Supabase raw_posts before any write so a
# schema drift (especially media_urls / the tz timestamps) aborts loudly rather
# than corrupting data.
EXPECTED_TYPES = {
    "id": ("uuid", "uuid"),
    "source_id": ("uuid", "uuid"),
    "external_id": ("text", "text"),
    "posted_at": ("timestamp with time zone", "timestamptz"),
    "text": ("text", "text"),
    "media_urls": ("ARRAY", "_text"),
    "archive_url": ("text", "text"),
    "lang": ("text", "text"),
    "ingested_at": ("timestamp with time zone", "timestamptz"),
}


def _host(conninfo: str) -> str:
    """Best-effort host extraction from a libpq URL or key=value DSN."""
    try:
        parsed = urlparse(conninfo)
        if parsed.hostname:
            return parsed.hostname
    except ValueError:
        pass
    for token in conninfo.split():
        if token.startswith("host="):
            return token[len("host=") :]
    return ""


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"ERROR: {name} environment variable is required")
    return value


def assert_write_target_is_supabase(supabase_url: str, neon_url: str) -> None:
    """Hard guardrail: refuse to write anywhere but Supabase, and never self-copy."""
    dst_host = _host(supabase_url).lower()
    if "supabase" not in dst_host:
        sys.exit(
            "ABORT: SUPABASE_URL host does not look like Supabase "
            f"(host={dst_host!r}). Refusing to write anywhere but Supabase."
        )
    if supabase_url == neon_url:
        sys.exit("ABORT: NEON_URL and SUPABASE_URL are identical — refusing self-copy.")
    src_host = _host(neon_url).lower()
    if "neon" not in src_host:
        print(
            f"WARNING: NEON_URL host {src_host!r} does not contain 'neon'; "
            "continuing (the source is only read).",
            file=sys.stderr,
        )


def validate_columns(dst: psycopg.Connection) -> None:
    """Abort unless every carried column exists in Supabase with the right type."""
    rows = dst.execute(
        """
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'raw_posts'
        """
    ).fetchall()
    present = {name: (data_type, udt) for name, data_type, udt in rows}

    problems = []
    for col, (want_dt, want_udt) in EXPECTED_TYPES.items():
        if col not in present:
            problems.append(f"  - {col}: MISSING from Supabase raw_posts")
            continue
        got_dt, got_udt = present[col]
        if (got_dt, got_udt) != (want_dt, want_udt):
            problems.append(
                f"  - {col}: expected {want_dt}/{want_udt}, got {got_dt}/{got_udt}"
            )
    if problems:
        sys.exit("ABORT: Supabase raw_posts schema mismatch:\n" + "\n".join(problems))
    print(f"Column/type check OK ({len(EXPECTED_TYPES)} carried columns).")


def main() -> int:
    neon_url = _require_env("NEON_URL")
    supabase_url = _require_env("SUPABASE_URL")
    apply = os.environ.get("APPLY", "false").strip().lower() in ("true", "1", "yes")

    assert_write_target_is_supabase(supabase_url, neon_url)

    print(f"Mode:             {'APPLY (writing)' if apply else 'DRY-RUN (no writes)'}")
    print(f"Source (Neon):    {_host(neon_url)}")
    print(f"Destination (SB): {_host(supabase_url)}")

    with psycopg.connect(neon_url) as src, psycopg.connect(
        supabase_url, autocommit=False
    ) as dst:
        # 1. Validate the destination schema before reading or writing anything.
        validate_columns(dst)

        # 2. Build the source_id remap by handle (Neon id -> handle -> Supabase id).
        neon_id_to_handle = {
            sid: handle for sid, handle in src.execute("SELECT id, handle FROM sources")
        }
        handle_to_sb_id = {
            handle: sid for handle, sid in dst.execute("SELECT handle, id FROM sources")
        }

        # 3. Every Neon source that actually has posts must remap; never skip silently.
        sources_with_posts = [
            row[0]
            for row in src.execute("SELECT DISTINCT source_id FROM raw_posts")
        ]
        unmapped = []
        for sid in sources_with_posts:
            handle = neon_id_to_handle.get(sid)
            if handle is None:
                unmapped.append(f"  - Neon source_id {sid}: absent from Neon sources")
            elif handle not in handle_to_sb_id:
                unmapped.append(
                    f"  - Neon source_id {sid} (handle {handle!r}): no Supabase source"
                )
        if unmapped:
            sys.exit(
                "ABORT: source-handle remap did not resolve 100%:\n" + "\n".join(unmapped)
            )
        print(
            f"Handle remap OK: all {len(sources_with_posts)} Neon sources with posts "
            "resolve to a Supabase source."
        )

        # 4. Snapshot the destination: existing keys (for the exact would-insert
        #    count) and the current row count (for post-run reconciliation).
        existing_keys = {
            (source_id, external_id)
            for source_id, external_id in dst.execute(
                "SELECT source_id, external_id FROM raw_posts"
            )
        }
        before_count = dst.execute("SELECT count(*) FROM raw_posts").fetchone()[0]

        # 5. Read every Neon raw_post (full-table copy) and remap source_id.
        select_cols = ", ".join(CARRIED_COLUMNS)
        neon_rows = src.execute(f"SELECT {select_cols} FROM raw_posts").fetchall()

        remapped_rows = []
        would_insert = 0
        new_by_handle: dict[str, int] = defaultdict(int)
        for row in neon_rows:
            row = list(row)
            handle = neon_id_to_handle[row[SOURCE_ID_IDX]]
            sb_source_id = handle_to_sb_id[handle]
            row[SOURCE_ID_IDX] = sb_source_id
            remapped_rows.append(tuple(row))
            if (sb_source_id, row[EXTERNAL_ID_IDX]) not in existing_keys:
                would_insert += 1
                new_by_handle[handle] += 1

        # 6. Report.
        print(f"Neon raw_posts total:      {len(neon_rows)}")
        print(f"Supabase raw_posts before: {before_count}")
        print(f"Would insert (new):        {would_insert}")
        print(f"Already present (skip):    {len(remapped_rows) - would_insert}")
        if new_by_handle:
            print("New rows by source handle:")
            for handle, count in sorted(
                new_by_handle.items(), key=lambda kv: (-kv[1], kv[0])
            ):
                print(f"  {count:>6}  {handle}")

        if not apply:
            print("DRY-RUN complete — nothing written. Re-run with APPLY=true to commit.")
            return 0

        # 7. APPLY: insert (idempotent on the unique key) and reconcile by count.
        placeholders = ", ".join(["%s"] * len(CARRIED_COLUMNS))
        insert_sql = (
            f"INSERT INTO raw_posts ({select_cols}, processed_at) "
            f"VALUES ({placeholders}, NULL) "
            "ON CONFLICT (source_id, external_id) DO NOTHING"
        )
        with dst.cursor() as cur:
            cur.executemany(insert_sql, remapped_rows)
        dst.commit()

        after_count = dst.execute("SELECT count(*) FROM raw_posts").fetchone()[0]
        delta = after_count - before_count
        print(f"Supabase raw_posts after:  {after_count}")
        print(f"Inserted (delta):          {delta}")
        if delta == would_insert:
            print(f"Reconciliation OK: delta == would_insert ({delta}).")
        else:
            print(
                f"WARNING: delta {delta} != predicted {would_insert} "
                "(concurrent writes?) — review before deleting the Neon project.",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
