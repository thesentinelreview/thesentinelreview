# Deployment Runbook

Stack: **Supabase** (Postgres) · **Vercel** (Next.js frontend) · **Railway** (Python workers)

Estimated time: ~30 minutes. Do these steps in order — each depends on the one before.

---

## 1. Database — Supabase

1. Go to [supabase.com](https://supabase.com) → **Create account** (free tier available).
2. Create a new project: pick a name, set a strong DB password, region `EU West (London)` or your nearest.
3. In **Project Settings → Database**, copy the **session-mode pooler** connection string (port 5432).
   It looks like: `postgresql://postgres.<ref>:<password>@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`
4. Enable extensions via the SQL Editor (PostGIS is pre-installed but disabled by default):
   - Run: `CREATE EXTENSION IF NOT EXISTS postgis;`
   - Run: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
   - Run: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
5. Run the migration. From your local machine:
   ```bash
   psql "postgresql://..." -f packages/db/migrations/0001_init.sql
   ```
6. Seed the source list:
   ```bash
   psql "postgresql://..." -f packages/db/seed/sources.sql
   ```
7. Keep the connection string — you'll paste it into Vercel and Railway next.

---

## 2. Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import the GitHub repo `thesentinelreview/thesentinelreview`.
3. Set **Root Directory** to `apps/web`.
4. Framework preset: **Next.js** (auto-detected).
5. Add environment variables:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Supabase pooler connection string (from step 1) |
   | `NEXT_PUBLIC_SITE_URL` | `https://thesentinelreview.com` (or your Vercel preview URL until you have a domain) |
6. Click **Deploy**. First deploy takes ~2 minutes.
7. Once live, visit the URL and confirm the dashboard loads with placeholder data (if DB is empty) or real data.

### Custom domain (optional)
- In Vercel project → **Settings → Domains** → add `thesentinelreview.com`
- Add the CNAME/A records your DNS registrar shows

---

## 3. Python workers — Railway

You need two Railway services: one running `sentinel-worker`, one running `sentinel-scheduler`.

### 3a. Create the project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Select `thesentinelreview/thesentinelreview`.
3. Railway will detect the repo. Do **not** auto-deploy yet — configure first.

### 3b. Worker service

1. In the project, click **New Service** → **GitHub Repo** → same repo.
2. Set **Root Directory** to `apps/ingest`.
3. Railway will use the `Dockerfile` automatically.
4. Under **Settings → Deploy**:
   - Start command: `sentinel-worker`
5. Add environment variables (Settings → Variables):
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Supabase pooler connection string |
   | `ANTHROPIC_API_KEY` | Your key from [console.anthropic.com](https://console.anthropic.com) |
   | `ANTHROPIC_MODEL_EXTRACT` | `claude-sonnet-4-6` |
   | `ANTHROPIC_MODEL_BRIEFING` | `claude-opus-4-7` |
   | `PYTHONUNBUFFERED` | `1` |
   | `LOG_LEVEL` | `INFO` |
6. Click **Deploy**.

### 3c. Scheduler service

1. Click **New Service** → same repo again.
2. Root Directory: `apps/ingest`.
3. Under **Settings → Deploy**:
   - Start command: `sentinel-scheduler`
4. Add the **same** environment variables as the worker.
5. Deploy.

### 3d. Verify

In Railway's log viewer, you should see within 60 seconds:
```
{"event": "scheduler_starting", ...}
{"event": "ingest_jobs_enqueued", "count": 10, ...}
```
And in the worker:
```
{"event": "worker_starting", ...}
{"event": "job_started", "job_type": "ingest_source", ...}
{"event": "ingesting_source", "source": "reuters_ukraine_rss", ...}
```

---

## 4. Anthropic API key

Get one at [console.anthropic.com](https://console.anthropic.com):
1. Sign in → **API Keys** → **Create Key**
2. Add billing if needed (pay-per-token, no subscription)
3. Paste into Railway worker + scheduler env vars

Cost estimate for v0.1 at low volume:
- Entity extraction (Sonnet): ~$0.003 per post × ~200 posts/day = **~$0.60/day**
- Briefing (Opus): ~$0.15 per briefing × 1/day = **~$0.15/day**
- Total: **< $1/day** at low volume

---

## 5. Post-deploy checklist

- [ ] Dashboard at your Vercel URL loads and shows the map
- [ ] `/sources` page shows all 31 seeded sources
- [ ] Railway worker logs show `ingesting_source` events
- [ ] After ~2 hours, `raw_posts` table has rows
- [ ] After a full day + Anthropic key wired, `events` table has rows
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your real domain once it's live

---

## Environment variable reference

### `apps/web` (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase Postgres pooler connection string |
| `NEXT_PUBLIC_SITE_URL` | No | Used in embed code output |

### `apps/ingest` (Railway)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same Supabase pooler connection string as `apps/web` |
| `ANTHROPIC_API_KEY` | Yes | From console.anthropic.com |
| `ANTHROPIC_MODEL_EXTRACT` | No | Default: `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_BRIEFING` | No | Default: `claude-opus-4-7` |
| `TELEGRAM_API_ID` | No | For Telegram ingestion |
| `TELEGRAM_API_HASH` | No | For Telegram ingestion |
| `WORKER_POLL_INTERVAL` | No | Seconds between job polls (default: 5) |
| `PYTHONUNBUFFERED` | Yes | Set to `1` for Railway log streaming |
