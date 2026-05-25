# Dashboard Session Handoff — 2026-05-25

Scope: the Next.js watchfloor dashboard (`apps/web`) and ingest scoring (`apps/ingest`).
All shipped work below is **merged to `main` and live in production** (Vercel →
`dashboard.thesentinelreview.com`). DB is Supabase/Postgres (project `ugpqgfvdqupttqhogavc`).

## Shipped (merged to `main`)

| PR | Squash commit | What |
|----|---------------|------|
| #114 | `1ebc6cf` | **Sector Threat board** — `getSectors()` groups events by `oblast` within the theater bbox (7d): events, strikes, level, week-over-week trend (`NEW` when no prior week). Replaced the dead "No sector data available" stub (mock data stripped in #61). |
| #115 | `5481dc6` | **`source_reliability` auto-refresh** — migration `0014_schedule_source_reliability_refresh.sql` registers a pg_cron job (`refresh-source-reliability`, every 30 min). The matview had *never* auto-refreshed (the schedule in `0001_init.sql` was left commented out), so confidence/activity stats went stale for days. |
| #116 | `4934b9c` | **Confidence consistency** — extracted `classify()` into `scorer.py`; `_maybe_upgrade_confidence` now reuses it. Previously the corroboration re-score promoted to `verified` on source/platform counts alone, dropping the strong-signal requirement `score_confidence` enforces. +7 `classify` unit tests (29 pass). |
| #117 | `850d4f1` | **Fusion + Median TTV KPIs** — `getFusionRate()` (% of events with ≥2 distinct sources) and `getMedianTTV()` (median `published_at` − primary source `posted_at`). KpiRail trimmed to 5 chips; **Contacts/Movements removed**. Rail = Events · Strikes · Verified · Fusion · Median TTV. |
| #118 | `8682210` | **Live SensorStrip** — `getSensorStripData()` drives 5 platform chips (**TG · X · RSS · GDELT · BSKY**), live LAT (median post age) + TRK (24h distinct actors). Removed the fake "FUSION 0.92". Spec said WIRE; swapped to **GDELT** (WIRE has no active sources; GDELT is the highest-volume feed). |

**Ops actions taken (not in git):**
- One-off `REFRESH MATERIALIZED VIEW CONCURRENTLY source_reliability` to unstick stale data immediately (iran confidence 0% → 16.7%).
- Two empty `chore: redeploy` commits on `main` (`e464ba8`, `8559f05`) to refresh the prod runtime during a transient DB blip. (Harmless; can be ignored.)

**Last verified live (anon/Watch-tier render, Ukraine/24h):** Events 41 · Strikes 30 · Verified 7% · Fusion 20% · Median TTV 1h 4m · Sector Threat populated · SensorStrip live (TRK 12). Logged-out (Watch tier) and signed-in both serve the same data — confirmed.

## Key findings / context
- **Why thin theaters read ~0% confidence/fusion:** confidence is corroboration-gated, and iran/myanmar/sudan have ~**0% multi-source events**. `apps/ingest/sentinel/pipeline/dedup.py` only merges posts into one event when they share the same `event_type` within **5 km / 6 h** — too strict, so corroboration rarely fires. #116 fixed the consistency bug but **not** this root cause.
- **The "production all-panels-empty" incident** was a transient DB-connectivity/cache blip during deploy churn — **not** a code bug and **not** auth/tier gating. `/` (the watchfloor) is public by design: `apps/web/proxy.ts` only gates `/api/*` and `/app/*` (except `/app/feed`). Resolved by redeploys.

## Open TODOs (prioritized)
1. **`/admin/tieout` Fusion Events table** (requested in the KPI spec) — **BLOCKED**: no `admin` route exists in the repo (it was removed; `proxy.ts` notes a "reintroduced admin route" must re-add its own admin-role check). Decision needed: recreate the admin page (auth/role gating + scope of "Section 1 KPI Tie-Out"), or confirm where it should live. Table spec: columns `event_id, occurred_at, event_type, location_name, source_count (distinct source_ids), confidence`, sorted by `source_count` desc; Fusion % must tie out to `/`.
2. **`/app` 5-chip acceptance** — `/app` has no KPI rail (only `/app/feed` exists). The rail lives solely on `/`. Confirm whether the watchfloor should also be mounted at `/app`.
3. **Loosen dedup** — the real lever for thin-theater fusion/confidence. Options: bump `RADIUS_KM` (~5→15–20), widen `WINDOW_HOURS`, relax exact `event_type` match, or add the description/embedding similarity the file's own v0.2 note describes. Needs sign-off (risk: merging genuinely distinct events). File: `apps/ingest/sentinel/pipeline/dedup.py`.
4. **Persisted `has_strong_signal` flag on events** — optional, for airtight re-score semantics. #116 currently reconstructs the signal conservatively from the event's current confidence; a stored boolean (migration + `insert_event` + `_maybe_upgrade_confidence`) removes the one transitional edge case.
5. **Verify migration 0014 applied** — it auto-runs via the ingest workflow's `migrate.py` (`.github/workflows/sentinel-ingest.yml`, every 30 min). Confirm with `SELECT jobname, schedule, active FROM cron.job;` → expect `refresh-source-reliability`.
6. **Watch: Vercel↔Supabase connection fragility** — the empty blip suggests the `pg` pool (`apps/web/lib/db.ts`, `max:5`, direct connection) can hiccup around deploys/cold starts. If it recurs, point `DATABASE_URL` at the Supavisor pooler (port 6543) and/or add connection retry handling. Not currently broken.

## Orientation (where things live)
- Watchfloor page (the `/` route): `apps/web/app/page.tsx` (`force-dynamic`; fetches everything in one `Promise.all`).
- Data layer: `apps/web/lib/queries.ts` — `getStats`, `getSectors`, `getFusionRate`, `getMedianTTV`, `getSensorStripData`, `getMapEvents`, `getAlerts`, `getIntensity`, `getTopSources`, `getLatestBriefing`. Each is theater-scoped via `THEATER_BBOX` and swallows errors → empty default.
- Components: `apps/web/components/watchfloor/` — `KpiRail`, `Kpi`, `SensorStrip`, `SectorThreat`, `SectorRow`, etc.
- Types: `apps/web/lib/types.ts` (`Stats`, `Sector`, `SensorStripData`, …).
- DB pool: `apps/web/lib/db.ts`. Middleware/auth: `apps/web/proxy.ts`, `apps/web/lib/auth.ts`.
- Scoring: `apps/ingest/sentinel/pipeline/scorer.py` (`classify`, `score_confidence`), `apps/ingest/sentinel/jobs/extract_events.py` (`_maybe_upgrade_confidence`), `apps/ingest/sentinel/pipeline/dedup.py`.
- Migrations: `packages/db/migrations/` (latest is `0014`). Runner: `packages/db/migrate.py`.

## Conventions / how to verify
- Branch `fix/<desc>` → PR into `main` → **squash merge**. Production deploys from `main` on every push.
- Web checks: from `apps/web`, `npx tsc --noEmit` and `npx eslint <files>`. Ingest tests: `python -m pytest apps/ingest/tests` (needs `pip install pytest pydantic pydantic-settings structlog` + editable install; some suites need `feedparser`/`httpx`/`psycopg`).
- No pytest/CI gate runs on PRs — only Cloudflare Pages + Vercel preview build checks (which only build the web app).
- **PR previews are SSO-gated** and the MCP bypass doesn't work on them. Verify rendered output on **production**: Vercel MCP `web_fetch_vercel_url` against `https://dashboard.thesentinelreview.com/?theater=ukraine` (append `&cb=<nonce>` to bust the fetch cache). Anonymous render == Watch-tier == what the public sees.
- SQL validation against prod: Supabase MCP `execute_sql` (project `ugpqgfvdqupttqhogavc`).

---

# (Earlier handoff preserved below)

# Dashboard Fix Handoff — 2026-05-17

## Symptom

`dashboard.thesentinelreview.com` was showing placeholder/demo data with an amber
warning banner: *"No live events found — the database appears empty."*

The ingest pipeline had been running for days and had inserted events into the
database, but none were visible on the dashboard. The db-check endpoint
(`/api/db-check`) confirmed the events existed but `published: 0`.

---

## Root Causes Found (in order of discovery)

### 1. `insert_event` never set `published_at` (primary)

**File:** `apps/ingest/sentinel/db.py`  
**Commit:** `bd7c6d4`

Every dashboard query filters `WHERE published_at IS NOT NULL`. The original
`INSERT INTO events` statement omitted the column entirely, so every row had
`published_at = NULL` and was invisible to the UI. Fixed by adding:

```sql
CASE WHEN held_for_review THEN NULL ELSE now() END
```

as the `published_at` value in the INSERT.

### 2. `feedparser` missing from the ingest Docker image

**File:** `apps/ingest/Dockerfile`  
**Commit:** `b87dcb2`

The system package `python3-feedparser` is not on pip's `PATH`, so all RSS
ingest jobs failed with `No module named feedparser`. Added `feedparser` to
`pip install` in the Dockerfile.

### 3. Broken RSS source URLs

**File:** `packages/db/migrations/0004_fix_rss_urls.sql`  
**Commit:** `bd7c6d4`

Several source URLs in the database pointed to old or dead feeds. Migration 0004
corrected the URLs so ingest jobs could actually fetch content.

### 4. No migration tracking — re-runs failed

**File:** `apps/ingest/migrate.py`

The migration runner had no state tracking, so re-running it on an existing
database would try to apply `0001_init.sql` (which uses `CREATE TABLE` without
`IF NOT EXISTS`) and crash. Added a `schema_migrations` table to track which
migrations have been applied. The runner now only applies pending ones and is
safe to re-run.

### 5. `schema_migrations` bootstrap on pre-existing databases

**Commit:** `a0a6c91`

On databases set up before the migration tracker existed, `schema_migrations`
was absent but all prior migrations had already been applied. The runner now
detects this state (empty `schema_migrations` but `sources` table exists) and
bootstraps: marks all migrations except the last as applied, then runs only the
genuinely pending migration.

### 6. Ingest workflow not running migrations

**File:** `.github/workflows/sentinel-ingest.yml`  
**Commit:** `1b73746`

The GitHub Actions ingest workflow didn't call `migrate.py`, so migrations were
never applied in production. The workflow now runs `python migrate.py` before
each ingest cycle.

### 7. Existing events had `published_at = NULL` (backfill)

**File:** `packages/db/migrations/0005_backfill_published_at.sql`  
**Commit:** `1b73746`

All events inserted before fix #1 had `published_at = NULL`. Migration 0005
backfills them:

```sql
UPDATE events
SET published_at = created_at
WHERE held_for_review = false
  AND published_at IS NULL;
```

Events held for human review are intentionally left with `published_at = NULL`.

### 8. `getLiveDataStatus` checked the wrong column

**File:** `apps/web/lib/queries.ts` → `getLiveDataStatus()`  
**Commit:** `7f7ef3e`

The function that controls the amber warning banner checked:
```sql
WHERE occurred_at > now() - INTERVAL '7 days'
```
Because `occurred_at` was stale on all events (see #9), this always returned
`db-empty` even with 15 published events. Fixed to:
```sql
WHERE published_at IS NOT NULL
```

### 9. Extractor didn't pass `posted_at` to the LLM

**File:** `apps/ingest/sentinel/pipeline/extractor.py`  
**Commit:** `7f7ef3e`

The extractor's user message included the post text and source metadata but not
the post's `posted_at` timestamp. The LLM was instructed to "use post timestamp
if unknown" but had no access to it. When posts didn't state an explicit event
date, the model guessed historical reference dates — often months or years in
the past. All events ended up with `occurred_at` far outside the dashboard's
default 24h/7d filter windows, making the map appear empty even though data
existed.

Fixed by including the post timestamp in the prompt:
```
Post timestamp (UTC): 2026-05-17 19:43 — use this as occurred_at if no
explicit event time is stated.
```

### 10. Stale `occurred_at` on already-ingested events (backfill)

**File:** `packages/db/migrations/0006_fix_occurred_at.sql`  
**Commit:** `843407a`

Migration 0006 corrects events created in the last 60 days whose `occurred_at`
is more than 30 days before `created_at` (a clear sign of a mis-extracted date):

```sql
UPDATE events
SET occurred_at = created_at
WHERE created_at  > now() - INTERVAL '60 days'
  AND occurred_at < created_at - INTERVAL '30 days';
```

The admin backfill endpoint (`/api/admin/backfill`) was also updated to apply
this fix on demand in addition to the `published_at` fix.

---

## State After All Fixes

```
db-check result:
  sources: 53
  events:
    total:           22
    published:       15   ← was 0
    last_24h:         5   ← was 0
    last_7d:         15   ← was 0
    last_inserted_at: 2026-05-17T19:57:39Z
```

The amber warning banner is gone. The map shows live events. The ingest pipeline
is running correctly and new events will have accurate `occurred_at` timestamps.

---

## Remaining Known Issues

### 7 events held for human review

Seven of the 22 events have `held_for_review = true` and `published_at = NULL`.
These were flagged as `is_high_impact = true` by the LLM extractor (mass-
casualty reports, airstrikes on civilian infrastructure, etc. — all per the
configured thresholds). They are intentionally withheld until a human reviewer
approves them.

**There is currently no human review UI.** These events will stay invisible to
the dashboard indefinitely until one is built. The `is_high_impact` criteria
in the Sudan and Myanmar theater prompts (`extractor.py`) are fairly broad and
may be over-triggering (e.g. *any* airstrike on civilian infrastructure in
Myanmar qualifies). Consider narrowing these thresholds if too many events are
being held.

### `occurred_at` = `created_at` for pre-fix events

The 22 events corrected by the backfill have `occurred_at` set to their
`created_at` time, not the actual conflict event time. This is a best-effort
approximation. As the ingest continues running with the fixed extractor, new
events will have accurate `occurred_at` values extracted from the source posts.

---

## Key Files Reference

| File | Role |
|---|---|
| `apps/ingest/sentinel/db.py` | `insert_event()` — sets `published_at` on insert |
| `apps/ingest/sentinel/pipeline/extractor.py` | LLM extraction — now passes `post_timestamp` |
| `apps/ingest/sentinel/jobs/extract_events.py` | Passes `post["posted_at"]` to extractor |
| `apps/ingest/migrate.py` | Migration runner with `schema_migrations` tracking |
| `apps/web/lib/queries.ts` | `getLiveDataStatus()` — banner logic |
| `apps/web/app/api/db-check/route.ts` | Health check endpoint |
| `apps/web/app/api/admin/backfill/route.ts` | Admin one-shot data repair endpoint |
| `packages/db/migrations/0005_backfill_published_at.sql` | Backfill `published_at` |
| `packages/db/migrations/0006_fix_occurred_at.sql` | Fix stale `occurred_at` |

---

## Admin Endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/db-check` | Health check: sources count, event counts by window, last insert time |
| `GET /api/admin/backfill` | Fixes `published_at = NULL` (non-held) and `occurred_at` stale values |
