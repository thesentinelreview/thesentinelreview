# The Sentinel Review — Handoff v4: Supabase Migration

> **Session date:** May 20, 2026
> **Continues from:** `HANDOFF_2026-05-19_source_feed.md`
> **Branch / PR:** `claude/explore-dashboard-redesign-vVLvu` → PR #52
> **Status at handoff:** PR open, Cloudflare Pages ✅, Vercel build running. **One manual step required before production is live on Supabase** (see §Manual Steps).

---

## What Changed This Session

The database backing both the web app and the ingest pipeline was migrated from **Neon Postgres** to **Supabase** ("Sentinel Map" project, `ugpqgfvdqupttqhogavc`, `eu-west-2`).

The Supabase project already existed (created May 8) but was INACTIVE (paused). It is now `ACTIVE_HEALTHY` with the full schema and seed data applied.

### Three files changed in code

| File | Change |
|---|---|
| `apps/web/lib/db.ts` | Added conditional SSL — Supabase requires SSL on all connections; local Postgres does not. Two lines added to `getPool()`. |
| `apps/web/.env.example` | Updated DATABASE_URL comment to document the session-mode pooler URL for Vercel/Next.js |
| `apps/ingest/.env.example` | Updated DATABASE_URL comment to document the direct connection URL for Railway/ingest |

No changes to ingest pipeline code. `psycopg3` natively parses SSL parameters from the connection URL — including `sslmode=require` in the Supabase URL is sufficient.

---

## Database State After Migration

**Project:** Sentinel Map · `ugpqgfvdqupttqhogavc` · eu-west-2 · Postgres 17.6.1

**Schema applied:** All 8 migrations in order:
- `0001_init.sql` — full schema (sources, raw_posts, events, event_sources, briefings, jobs, llm_logs, user_subscriptions), PostGIS + pg_trgm, materialized view, helper functions
- `0002` through `0008` — theater column, user_subscriptions, RSS URL fixes, backfills, held_events release, translated_text column

**Extensions confirmed:** `postgis` 3.3.7, `pg_trgm` 1.6

**Seed data:**
```
sources:          45  (Ukraine: 31, Sudan: 7, Myanmar: 7)
published_events: 26  (Ukraine: 9, Iran: 6, Sudan: 6, Myanmar: 5)
raw_posts:        49
event_sources:    49
subscriptions:     0  (empty, as expected — fresh DB)
jobs:              0  (empty, as expected — no ingest run yet)
```

---

## Connection Strategy — Two URLs, Two Consumers

This is the key architectural decision. Use the wrong URL and either pgBouncer compatibility or psycopg_pool session state will break.

| Consumer | Connection type | URL pattern |
|---|---|---|
| **Web app (Vercel / Next.js)** | Session-mode pooler, port 5432 | `postgresql://postgres.ugpqgfvdqupttqhogavc:[PW]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres` |
| **Ingest app (Railway) + migrations** | Direct connection, port 5432 | `postgresql://postgres:[PW]@db.ugpqgfvdqupttqhogavc.supabase.co:5432/postgres` |

**Why not the transaction-mode pooler (port 6543)?**
node-postgres uses the extended query protocol for parameterized queries. pgBouncer transaction mode drops the extended protocol, causing `ERROR: bind message ... unknown prepared statement` on every second request. Don't use port 6543 for anything.

**Why not the session-mode pooler for ingest?**
`psycopg_pool.ConnectionPool` keeps persistent connections. The ingest worker also uses `FOR UPDATE SKIP LOCKED` on the jobs table, which requires session-level lock state. The direct connection is correct for this consumer.

**Password location:** Supabase dashboard → Project Settings → Database → Connection string. Copy the password from the `postgresql://` URI shown there.

---

## Manual Steps Required

These cannot be done from inside the agent session. Both are required before the migration is live in production.

### 1. Update Vercel environment variable

In the [Vercel dashboard](https://vercel.com) for the `thesentinelreview` project:

- Go to **Settings → Environment Variables**
- Update `DATABASE_URL` to the **session-mode pooler** URL:
  ```
  postgresql://postgres.ugpqgfvdqupttqhogavc:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
  ```
- Redeploy (or merge PR #52 after setting the env var — the Vercel build will pick it up)

### 2. Update Railway environment variable

In the Railway dashboard for the ingest service:

- Set `DATABASE_URL` to the **direct connection** URL:
  ```
  postgresql://postgres:[PASSWORD]@db.ugpqgfvdqupttqhogavc.supabase.co:5432/postgres
  ```
- Railway will restart the service automatically

### 3. Run the translation backfill (optional, carry-over from v3)

The `sentinel-backfill-translations` workflow was noted as outstanding in the May 19 handoff. It can be run after Railway is pointed at Supabase. It will write to `raw_posts.translated_text` in the new Supabase DB.

---

## Verification Checklist

After both env vars are set:

- [ ] `/api/db-check` returns `sources: 45`, `published: 26`
- [ ] `/app` (dashboard) shows map pins for Ukraine/Iran/Sudan/Myanmar, no amber placeholder banner
- [ ] `/app/feed` shows Source Feed posts (requires at least one ingest run after Railway is updated)
- [ ] `/api/admin/integrity` returns `"ok": true` (run after first ingest cycle)
- [ ] `sentinel-run-checks` passes in Railway logs

---

## Why This Migration Now

The May 19 handoff noted "Supabase migration was discussed and parked." It was completed this session because:

1. The Supabase project already existed and was provisioned — no new cost
2. The dashboard redesign work (this branch's stated goal) benefits from Supabase's built-in dashboard for quick data inspection
3. Cloudflare Pages is the frontend host; Supabase's eu-west-2 region is geographically closer to both EU readers and the Cloudflare edge than Neon's default region

---

## What's Next (dashboard redesign)

PR #52 is the migration prerequisite for the dashboard redesign. Once merged and both env vars are set, the branch `claude/explore-dashboard-redesign-vVLvu` is the right place to continue work on the redesign.

The prior handoffs note these as queued UI work:

- **Human review UI** — seven events were historically held for review; that gate is now off, but a reviewer-facing view was never built. Low priority.
- **Paywall for AI synthesis** — Clerk + Stripe plumbing exists; the wiring from tier check to paywall is the remaining work. Deferred until beta validation is complete.
- **Translator-quality monitoring** — no dashboard surfaces translation failure rate or skip rates. Could be added to `checks.py`.

---

## Key Reference

### Admin endpoints
| Endpoint | What it does |
|---|---|
| `GET /api/db-check` | Sources count, event totals by window, last insert time |
| `GET /api/admin/backfill` | One-shot repair: fixes `published_at = NULL` and stale `occurred_at` |
| `GET /api/admin/integrity` | Full integrity report: all 10 checks with pass/fail and detail |

### Critical file locations
| File | Role |
|---|---|
| `apps/web/lib/db.ts` | node-postgres pool — SSL conditional added this session |
| `apps/web/lib/queries.ts` | All frontend DB queries |
| `apps/ingest/sentinel/db.py` | Ingest-side DB helpers |
| `apps/ingest/sentinel/checks.py` | 10 data integrity checks |
| `packages/db/migrate.py` | Migration runner (tracks applied migrations in `schema_migrations`) |
| `packages/db/migrations/` | 8 migration files — all applied to Supabase |
| `packages/db/seed/` | 3 seed files — all applied to Supabase |

### Supabase project
| Field | Value |
|---|---|
| Project ID | `ugpqgfvdqupttqhogavc` |
| Name | Sentinel Map |
| Region | eu-west-2 |
| Postgres version | 17.6.1 |
| Status | ACTIVE_HEALTHY |
