# Rogue-Neon raw_posts backfill — 2026-05-28

## Incident in brief

During the 2026-05-24 Supabase cutover, the GitHub Actions `DATABASE_URL`
secret was pointed at a now-frozen Neon project (`tiny-night-97017367`) for
~58 hours (2026-05-24 14:14 UTC → 2026-05-26 00:32 UTC). 342 `raw_posts` rows
landed in the rogue Neon DB during that window. The DB-identity preflight added
on 2026-05-26 (`apps/ingest/sentinel/preflight.py`, PR #123 / commit `27910c1`)
now blocks the workflow if `DATABASE_URL` doesn't contain the expected Supabase
host, so the same failure mode can't recur silently.

The earlier cleanup handoff dismissed the rogue-write count as "2 rows / 1.3
hours". Both numbers were wrong. Corrected figures, verified against Supabase
(`ugpqgfvdqupttqhogavc`) on 2026-05-28:

| Field | Earlier estimate | Verified |
|---|---:|---:|
| Rogue-write window | 1.3 h | **~58 h** |
| Rows landed in rogue Neon | 2 | **342** |
| Rows missing from Supabase at backfill time | 2 | **57** |

The original handoff projected ~133 missing; by the time the backfill ran the
canonical sentinel-ingest had already self-healed ~76 of those rows by
re-fetching from the upstream feeds (so only 57 were genuinely absent from
Supabase). Note that the rogue writer was the GHA `DATABASE_URL` secret, not
Railway as a prior note suggested.

## What was done

1. `apps/ingest/scripts/neon_backfill_2026_05/` — runner + payload + remap +
   README committed on this branch (`56feafe`, PR #156).
2. Dry-run validation: all 342 source_ids mapped cleanly via
   `source_id_remap.json` (18 sources, 1:1).
3. Pre-backfill baseline:
   `count(*) FROM raw_posts WHERE ingested_at >= '2026-05-24 14:14:53+00'` =
   **2,555**.
4. Probe (anti-join of payload tuples vs. `raw_posts`): 285 already present,
   **57 missing**.
5. Backfill executed via the Supabase MCP `execute_sql`, batched 50 rows ×
   6 + 42 rows × 1, all `ON CONFLICT (source_id, external_id) DO NOTHING`.
   Inserts per batch: 0 / 0 / 20 / 7 / 7 / 13 / 10 = **57**.
6. Post-backfill verification:
   - Count: **2,612** (= 2,555 + 57). ✓
   - The two tier-1 IDs called out in the original handoff
     (`english.dvb.no/?p=118428` and `tass.com/world/2136385`) are present
     with `processed_at = NULL`. ✓
   - The next `sentinel-ingest.yml` tick (every 30 min) will pick the new
     unprocessed rows up via
     `apps/ingest/sentinel/db.py:get_unprocessed_posts` (line 155) and run
     `extract_events` on them normally.

## Open follow-up

How the GHA `DATABASE_URL` secret got pointed at Neon for ~58 h after the
2026-05-24 cutover is still unknown — worth a separate investigation. The
DB-identity preflight (PR #123) blocks the failure mode from recurring
silently, but doesn't explain the original mis-point.

The frozen Neon project (`tiny-night-97017367`) can be archived and deleted
per the original cleanup plan now that this backfill is verified successful.

## Re-running

The script is idempotent — `ON CONFLICT (source_id, external_id) DO NOTHING`
makes a re-run safe. See
`apps/ingest/scripts/neon_backfill_2026_05/README.md` for the runbook.
