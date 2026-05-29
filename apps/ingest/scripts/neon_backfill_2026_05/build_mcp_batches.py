#!/usr/bin/env python3
"""
Build batched SQL files for the rogue-Neon raw_posts backfill, suitable for
running via the Supabase MCP execute_sql tool (no DATABASE_URL needed).

Output: ./batches/batch_NNN.sql -- multi-VALUES INSERTs, ON CONFLICT skip,
RETURNING id so the caller can count actual inserts per batch.

Usage:
    python build_mcp_batches.py [--batch-size 50] [--out-dir batches]
"""
import argparse
import json
import os
import sys

PAYLOAD_PATH = os.environ.get("BACKFILL_PAYLOAD", "neon_backfill_payload.json")
REMAP_PATH = os.environ.get("BACKFILL_REMAP", "source_id_remap.json")


def lit_str(s):
    """Postgres single-quoted string literal. standard_conforming_strings is on
    by default since PG 9.1, so backslashes are literal -- only single quotes
    need escaping (by doubling). Returns NULL for None."""
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def lit_text_array(arr):
    if not arr:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(lit_str(x) for x in arr) + "]::text[]"


def lit_ts(s):
    """Cast an ISO 8601 string to timestamptz."""
    return lit_str(s) + "::timestamptz"


def lit_uuid(s):
    return lit_str(s) + "::uuid"


def row_values(r, supabase_src):
    return (
        "(" + ", ".join([
            lit_uuid(r["id"]),
            lit_uuid(supabase_src),
            lit_str(r["eid"]),
            lit_ts(r["pat"]),
            lit_str(r["txt"]),
            lit_text_array(r["mu"]),
            lit_str(r["au"]),
            lit_str(r["lg"]),
            lit_ts(r["iat"]),
            "NULL",
            "NULL",
        ]) + ")"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--out-dir", default="batches")
    args = parser.parse_args()

    with open(PAYLOAD_PATH) as f:
        rows = json.load(f)
    with open(REMAP_PATH) as f:
        remap = json.load(f)["mapping"]

    unmapped = [r["src"] for r in rows if r["src"] not in remap]
    if unmapped:
        print(f"FATAL: {len(unmapped)} unmapped source_ids: {set(unmapped)}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.out_dir, exist_ok=True)

    header = (
        "INSERT INTO raw_posts (id, source_id, external_id, posted_at, text, "
        "media_urls, archive_url, lang, ingested_at, processed_at, skip_reason)\n"
        "VALUES\n"
    )
    footer = "\nON CONFLICT (source_id, external_id) DO NOTHING\nRETURNING id;\n"

    total_batches = (len(rows) + args.batch_size - 1) // args.batch_size
    for batch_idx in range(total_batches):
        start = batch_idx * args.batch_size
        end = min(start + args.batch_size, len(rows))
        batch_rows = rows[start:end]
        values_sql = ",\n".join(
            row_values(r, remap[r["src"]]["supabase_id"]) for r in batch_rows
        )
        sql = header + values_sql + footer
        out_path = os.path.join(args.out_dir, f"batch_{batch_idx + 1:03d}.sql")
        with open(out_path, "w") as f:
            f.write(sql)
        print(f"  {out_path}  ({len(batch_rows)} rows, {len(sql)} bytes)")

    print(f"\nWrote {total_batches} batch file(s) to {args.out_dir}/ "
          f"({len(rows)} rows total, batch size {args.batch_size}).")


if __name__ == "__main__":
    main()
