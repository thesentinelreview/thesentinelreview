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
