# System Architecture — The Sentinel Review

How GitHub, Vercel, Neon, and Railway work together to collect OSINT,
process it through an LLM pipeline, and serve the dashboard.

---

## High-Level Flow

```
OSINT Sources (RSS / Telegram / X)
         │
         ▼
  GitHub Actions ──────────────────────────► Anthropic API
  (ingest cron, every 30 min)                (claude-sonnet-4-6 extraction
         │                                    claude-opus-4-7 briefings)
         ▼
  Neon (PostgreSQL + PostGIS)
    ├── raw_posts        ← fetched source content
    ├── events           ← extracted conflict events
    ├── event_sources    ← links events to source posts
    ├── briefings        ← AI-generated daily briefings
    ├── jobs             ← async work queue
    ├── sources          ← 53 monitored OSINT accounts
    └── llm_logs         ← full audit trail of every LLM call
         │
         ▼
  Vercel (Next.js dashboard)
  dashboard.thesentinelreview.com
         │
         ▼
  End users (subscribers + analysts)
```

---

## Services in Detail

### GitHub (source of truth + scheduler)

The repository is the central nervous system. It holds all code AND drives
every scheduled job via GitHub Actions.

#### Workflows

| Workflow | File | Schedule | What it does |
|---|---|---|---|
| **Sentinel Ingest** | `sentinel-ingest.yml` | Every 30 min | Fetches new posts from all 53 active OSINT sources, runs LLM extraction, writes events to Neon |
| **Sentinel Briefing** | `sentinel-briefing.yml` | 12:00 + 20:00 UTC | Reads recent events from Neon, generates an intelligence briefing with claude-opus-4-7, writes to `briefings` table |
| **Send Briefing** | `briefing.yml` | 01:00 UTC daily | Sends the briefing to email subscribers via Buttondown |
| **Aggregate News** | `main.yml` | Every 8 hours | Runs `aggregate.py` → updates `index.html` and `feed.xml`, commits back to main, optionally posts to X |
| **Publish White Paper** | `publish-pdf.yml` | Manual only | Copies a PDF from a feature branch into main |

#### Key GitHub secrets

| Secret | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | All ingest workflows | Neon connection string |
| `ANTHROPIC_API_KEY` | Ingest + briefing | LLM calls |
| `BUTTONDOWN_API_KEY` | Briefing send | Email delivery |
| `X_API_KEY` / `X_*` | Aggregate News | Post to X (Twitter) |

**Important:** GitHub Actions cron jobs can lag by up to 30–60 minutes under
heavy load. The briefing workflow has a fallback that schedules immediately if
the expected window is missed.

---

### Neon (PostgreSQL database)

Neon hosts the single shared Postgres database used by every part of the stack.
It is the only stateful service.

**Region:** US East (N. Virginia) — matches Vercel's `iad1` region to minimise
query latency.

**Required extensions:** `postgis` (geospatial indexing), `pg_trgm` (text
search), `uuid-ossp` (UUID generation).

#### Schema overview

| Table | Purpose |
|---|---|
| `sources` | 53 monitored accounts (handle, platform, trust_tier, RSS URL, theater) |
| `raw_posts` | Every fetched post, deduplicated by `(source_id, external_id)` |
| `events` | Extracted conflict events — the core data the dashboard shows |
| `event_sources` | Many-to-many: which raw_posts corroborate which event |
| `briefings` | AI-written daily intelligence reports |
| `jobs` | Async work queue (claimed by workers, retried on failure) |
| `llm_logs` | Full prompt + response audit log for every LLM call |
| `source_reliability` | Materialised stats per source (verified rate, event count) |
| `schema_migrations` | Tracks which `.sql` migration files have been applied |

#### Connection

Both Vercel and ingest workers share the same `DATABASE_URL`:
```
postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require
```

This means there is **one database** — no staging/production split currently.

#### Migrations

SQL files in `packages/db/migrations/` are applied in filename order by
`packages/db/migrate.py`. The `sentinel-ingest.yml` workflow runs
`python packages/db/migrate.py` before every ingest cycle, so new migrations
deploy automatically without manual intervention.

---

### Vercel (dashboard frontend)

Vercel hosts the Next.js application in `apps/web/`.

**Trigger:** Any push to `main` automatically triggers a new production
deployment. Pull requests get preview deployments at a unique URL.

**Region:** `iad1` (US East) — set in `apps/web/vercel.json`.

**Framework:** Next.js (App Router, server components, no client-side DB calls).

#### Environment variables (set in Vercel dashboard)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection — all queries run server-side |
| `CLERK_SECRET_KEY` | Clerk auth (paywall for Analyst tier) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (client-side) |
| `NEXT_PUBLIC_SITE_URL` | Canonical domain for metadata/OG tags |

#### Key routes

| Route | What it serves |
|---|---|
| `/` | Public landing + map (free tier, Ukraine default) |
| `/app` | Analyst dashboard (Clerk-protected) |
| `/briefing/[id]` | Individual briefing page |
| `/sources` | Source directory |
| `/api/db-check` | Health check — sources count, event counts, last insert time |
| `/api/admin/backfill` | One-shot admin repair: fixes `published_at` and stale `occurred_at` |
| `/api/webhooks/stripe` | Stripe payment webhooks |
| `/api/checkout` | Checkout session creation |

#### How data flows to the UI

```
Browser request
     │
     ▼
Vercel serverless function (Next.js server component)
     │
     ├── isDatabaseConfigured()? No → return placeholder data
     │
     └── Yes → query Neon (pg Pool, max 5 connections)
                    │
                    ├── getStats()       — event counts by theater + time range
                    ├── getMapEvents()   — events with lat/lng for map pins
                    ├── getAlerts()      — high-confidence events for alert strip
                    ├── getIntensity()   — 7-day intensity chart data
                    └── getLiveDataStatus() — drives amber warning banner
```

The amber banner logic:
- `"no-db"` → `DATABASE_URL` not set
- `"db-empty"` → DB connected but no published events (`published_at IS NOT NULL`)
- `"live"` → published events exist; use real data

---

### Railway (Python ingest workers)

Railway runs the Python ingest service defined in `apps/ingest/`, built from
`apps/ingest/Dockerfile`.

**Note:** Railway was the original long-running worker/scheduler approach.
GitHub Actions (`sentinel-ingest.yml`) now serves as the primary ingest
scheduler. Railway may run the long-running `sentinel-worker` and
`sentinel-scheduler` as a parallel or backup path — check the Railway dashboard
to see which services are active.

#### Railway services (as designed in DEPLOY.md)

| Service | Start command | What it does |
|---|---|---|
| **Worker** | `sentinel-worker` | Long-running process; claims jobs from the `jobs` table and executes them one at a time |
| **Scheduler** | `sentinel-scheduler` | Enqueues `ingest_source` jobs every 30 min and a `generate_briefing` job daily at 06:00 UTC |

#### GitHub Actions equivalent (currently active)

`sentinel-ingest.yml` runs `sentinel-run-ingest`, which enqueues all ingest
jobs and drains the queue to completion in a single process, then exits. This
is functionally equivalent to the Railway scheduler + worker pair but runs
ephemerally on GitHub's infrastructure.

#### Ingest pipeline (per source, per run)

```
sentinel-run-ingest
      │
      ├── 1. Enqueue one ingest_source job per active RSS/Telegram/X source
      │
      └── 2. Drain queue (worker loop):
               │
               ├── ingest_source job
               │     ├── Fetch RSS feed (or Telegram/X)
               │     ├── INSERT INTO raw_posts (skip duplicates)
               │     └── Enqueue extract_events job for new posts
               │
               └── extract_events job
                     ├── Call claude-sonnet-4-6 with post text + posted_at
                     │   → structured event (type, location, occurred_at, is_high_impact)
                     ├── Dedup against nearby events in DB
                     ├── Score confidence (verified / partial / unconfirmed)
                     ├── INSERT INTO events
                     │   published_at = now()        if NOT held_for_review
                     │   published_at = NULL          if held_for_review (high-impact)
                     └── INSERT INTO event_sources
```

#### Environment variables (set in Railway service settings)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Same Neon connection string as Vercel |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `ANTHROPIC_MODEL_EXTRACT` | `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_BRIEFING` | `claude-opus-4-7` |
| `LOG_LEVEL` | `INFO` |

---

## Data Lifecycle End-to-End

```
1. INGEST (every 30 min — GitHub Actions)
   RSS / Telegram / X
        └─► raw_posts table

2. EXTRACT (immediately after ingest — same Action run)
   raw_posts
        └─► claude-sonnet-4-6 (LLM entity extraction)
        └─► events table
              published_at = now()   [normal events, visible to dashboard]
              published_at = NULL    [high-impact, held for human review]
        └─► event_sources table (links event ↔ raw_post ↔ source)
        └─► llm_logs table (full audit trail)

3. BRIEFING (12:00 + 20:00 UTC — GitHub Actions)
   events table (last 24h, confidence ≥ partial)
        └─► claude-opus-4-7 (briefing generation)
        └─► briefings table
              status = 'published', published_at = now()

4. EMAIL SEND (01:00 UTC — GitHub Actions)
   briefings table (latest)
        └─► Buttondown API
        └─► subscriber inboxes

5. DASHBOARD (on demand — Vercel)
   events + briefings + sources tables
        └─► Next.js server components
        └─► dashboard.thesentinelreview.com
```

---

## Confidence & Publishing Rules

Events pass through a scoring step before insertion:

| Score | Condition |
|---|---|
| `verified` | ≥2 independent sources, different platforms, + geolocation / official ack / press |
| `partial` | ≥2 sources same platform; or 1 tier-1 source + geo evidence |
| `unconfirmed` | Single source, no strong corroboration |

`published_at` is set to `now()` on insert **unless** `held_for_review = true`.
Events are held when the LLM flags `is_high_impact = true` (mass-casualty,
nuclear site, WMD, cross-border escalation). Held events need a human reviewer
to approve them — **no review UI exists yet**.

---

## Deployment Checklist (fresh setup)

1. **Neon** — create project, enable PostGIS, run `packages/db/migrate.py`
2. **GitHub secrets** — set `DATABASE_URL`, `ANTHROPIC_API_KEY`, `BUTTONDOWN_API_KEY`
3. **Vercel** — import repo, set root to `apps/web`, add `DATABASE_URL` + Clerk keys
4. **Railway** (optional) — import repo, root `apps/ingest`, set env vars, start `sentinel-worker` + `sentinel-scheduler`
5. **Seed sources** — run `psql ... -f packages/db/seed/sources.sql`
6. **Trigger ingest** — manually dispatch `sentinel-ingest.yml` and verify events appear

---

## Known Limitations

- **Single database** — Vercel and ingest share the same Neon instance; no staging DB.
- **No human review UI** — held-for-review events are stuck until one is built.
- **GitHub Actions cron lag** — can be 15–60 min late under GitHub load; briefing workflow has a fallback but ingest does not.
- **No Telegram/X ingest** — credentials not configured; only RSS is active currently.
- **occurred_at accuracy** — events created before the `post_timestamp` extractor fix (2026-05-17) have `occurred_at = created_at` (approximate). Future events use the actual post timestamp as a fallback.
