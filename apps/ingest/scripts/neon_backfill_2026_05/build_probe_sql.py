#!/usr/bin/env python3
"""
Emit a probe SQL that compares the 342 payload (source_id, external_id) tuples
against the current state of raw_posts in Supabase, telling us exactly how many
are missing and which specific tuples need an INSERT.

Usage:
    python build_probe_sql.py > probe_overlap.sql
    python build_probe_sql.py --missing-only > probe_missing.sql   # lists missing tuples
"""
import argparse
import json
import os
import sys

PAYLOAD_PATH = os.environ.get("BACKFILL_PAYLOAD", "neon_backfill_payload.json")
REMAP_PATH = os.environ.get("BACKFILL_REMAP", "source_id_remap.json")


def lit_str(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--missing-only", action="store_true",
                        help="Emit a query that lists the (source_id, external_id) tuples missing from raw_posts.")
    args = parser.parse_args()

    with open(PAYLOAD_PATH) as f:
        rows = json.load(f)
    with open(REMAP_PATH) as f:
        remap = json.load(f)["mapping"]

    values = []
    for r in rows:
        supabase_src = remap[r["src"]]["supabase_id"]
        values.append(f"({lit_str(supabase_src)}::uuid, {lit_str(r['eid'])})")

    values_sql = ",\n  ".join(values)

    if args.missing_only:
        print(f"""WITH payload(source_id, external_id) AS (
  VALUES
  {values_sql}
)
SELECT p.source_id, p.external_id
FROM payload p
LEFT JOIN raw_posts rp
  ON rp.source_id = p.source_id
 AND rp.external_id = p.external_id
WHERE rp.id IS NULL
ORDER BY p.external_id;""")
    else:
        print(f"""WITH payload(source_id, external_id) AS (
  VALUES
  {values_sql}
)
SELECT
  count(*)            AS total_payload,
  count(rp.id)        AS already_in_supabase,
  count(*) - count(rp.id) AS missing_from_supabase
FROM payload p
LEFT JOIN raw_posts rp
  ON rp.source_id = p.source_id
 AND rp.external_id = p.external_id;""")


if __name__ == "__main__":
    main()
