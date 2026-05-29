# Rogue-Neon raw_posts backfill — 2026-05-24/26 cutover incident

One-time recovery of 342 `raw_posts` that landed in a now-frozen Neon project
(`tiny-night-97017367`) during the post-cutover window when the
`DATABASE_URL` GitHub Actions secret was mis-pointed at Neon for ~58 hours
(2026-05-24 14:14 UTC → 2026-05-26 00:32 UTC). About 209 rows overlap with rows
already in Supabase from the dual-write window; the remainder (~133) land
fresh and are picked up by the next `sentinel-ingest` tick.

No events were at risk — rogue Neon's `extract_events` jobs all failed on a
missing `translated_text` column (added in
`packages/db/migrations/0008_add_raw_post_translation.sql`), so this restores
raw source material only.

## Files

- `backfill_rogue_neon.py` — runner. Validates inputs, remaps Neon source UUIDs
  to Supabase source UUIDs, INSERTs with `ON CONFLICT (source_id, external_id)
  DO NOTHING`. Aborts if `DATABASE_URL` doesn't contain `supabase.com`.
- `neon_backfill_payload.json` — 342 rows pulled from rogue Neon.
- `source_id_remap.json` — Neon source UUID → Supabase source UUID map (18
  sources, all 1:1).

## How to run

```sh
cd apps/ingest/scripts/neon_backfill_2026_05

# 1. Dry-run (no DB connection; validates the 342 source_id mappings)
python backfill_rogue_neon.py --dry-run

# 2. Real run -- set DATABASE_URL via export in the terminal, NOT in chat
export DATABASE_URL='postgresql://postgres.ugpqgfvdqupttqhogavc:[PASSWORD]@aws-1-eu-west-2.pooler.supabase.com:5432/postgres'
python backfill_rogue_neon.py
```

All 342 INSERTs run inside a single transaction. The script is idempotent —
re-running is safe (`ON CONFLICT DO NOTHING`).

## Verify (against Supabase, project `ugpqgfvdqupttqhogavc`)

```sql
-- Should jump by ~133
SELECT count(*) FROM raw_posts
WHERE ingested_at >= '2026-05-24 14:14:53+00';

-- Two tier-1 rows the incident report calls out
SELECT external_id, source_id, processed_at
FROM raw_posts
WHERE external_id IN (
  'https://english.dvb.no/?p=118428',
  'https://tass.com/world/2136385'
);

-- After the next sentinel-ingest tick the unprocessed count drops toward 0
SELECT count(*) FROM raw_posts
WHERE ingested_at BETWEEN '2026-05-24 14:14:53+00' AND '2026-05-26 00:35:00+00'
  AND processed_at IS NULL;
```

See `HANDOFF_2026-05-28_rogue_neon_backfill.md` at the repo root for the
incident summary and the corrections to earlier handoffs.
