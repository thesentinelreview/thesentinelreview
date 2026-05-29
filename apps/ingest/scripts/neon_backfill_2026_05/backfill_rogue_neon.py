#!/usr/bin/env python3
"""
One-time backfill: rogue Neon Sentinel Dashboard -> Supabase Sentinel Map.

Recovers 342 raw_posts that landed in rogue Neon during the 2026-05-24/25 cutover
window when the GitHub Actions DATABASE_URL secret was pointed at the wrong DB.
209 of those are already in Supabase (dual-write overlap); ON CONFLICT (source_id,
external_id) DO NOTHING skips them. The remaining ~133 land fresh with
processed_at=NULL, and the next GHA ingest tick will extract events from them.

NO new events are at risk here -- rogue Neon's extract_events pipeline was broken
the whole time (translated_text column missing), so we're only restoring raw posts.

Usage:
    # Dry-run (no DB connection; validates mapping only):
    python backfill_rogue_neon.py --dry-run

    # Real run (DATABASE_URL must point at Supabase; the script aborts otherwise):
    export DATABASE_URL='postgresql://postgres.ugpqgfvdqupttqhogavc:[PW]@aws-1-eu-west-2.pooler.supabase.com:5432/postgres'
    python backfill_rogue_neon.py
"""
import argparse
import json
import os
import sys

PAYLOAD_PATH = os.environ.get("BACKFILL_PAYLOAD", "neon_backfill_payload.json")
REMAP_PATH = os.environ.get("BACKFILL_REMAP", "source_id_remap.json")

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--dry-run", action="store_true", help="Validate inputs and source-id mappings, then exit without opening a DB connection.")
args = parser.parse_args()

with open(PAYLOAD_PATH) as f:
    rows = json.load(f)
with open(REMAP_PATH) as f:
    remap = json.load(f)["mapping"]

print(f"Loaded {len(rows)} rows from {PAYLOAD_PATH}")
print(f"Loaded {len(remap)} source mappings from {REMAP_PATH}")

unmapped = []
remapped = []
for r in rows:
    new_src = remap.get(r["src"], {}).get("supabase_id")
    if not new_src:
        unmapped.append(r["src"])
        continue
    remapped.append((
        r["id"], new_src, r["eid"], r["pat"], r["txt"],
        r["mu"], r["au"], r["lg"], r["iat"],
    ))

if unmapped:
    print(f"FATAL: {len(unmapped)} rows have unmapped source_ids: {set(unmapped)}", file=sys.stderr)
    sys.exit(1)

if args.dry_run:
    print(f"All {len(remapped)} rows have source mappings. Dry-run only -- no INSERTs issued.")
    print("Expected on real run: ~133 inserted, ~209 skipped (rough; dual-write overlap from cutover).")
    sys.exit(0)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Export the Supabase pooler URL first.", file=sys.stderr)
    sys.exit(1)
if "supabase.com" not in DATABASE_URL:
    print(f"ERROR: DATABASE_URL doesn't look like Supabase. Got: {DATABASE_URL[:60]}...", file=sys.stderr)
    sys.exit(1)

print(f"All {len(remapped)} rows have source mappings. Proceeding with INSERT.")

import psycopg  # imported here so --dry-run works without psycopg installed

sql = """
INSERT INTO raw_posts (id, source_id, external_id, posted_at, text, media_urls, archive_url, lang, ingested_at, processed_at, skip_reason)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, NULL)
ON CONFLICT (source_id, external_id) DO NOTHING
RETURNING id;
"""

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        inserted = 0
        skipped = 0
        for row in remapped:
            cur.execute(sql, row)
            result = cur.fetchone()
            if result:
                inserted += 1
            else:
                skipped += 1
        conn.commit()

print(f"\nResult:")
print(f"  Inserted (new):  {inserted}")
print(f"  Skipped (existed): {skipped}")
print(f"  Total processed: {inserted + skipped}")
print(f"\nExpected: ~133 inserted, ~209 skipped (rough -- dual-write overlap from cutover period)")
print(f"\nNext: the next GHA sentinel-ingest tick (every 30 min) will pick up the new unprocessed raw_posts and run extract_events on them.")
