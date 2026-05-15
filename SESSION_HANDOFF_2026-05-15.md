# Session Handoff — 2026-05-15

## What We Did This Session

### 1. System Architecture Audit
Mapped the full technical stack and how every service connects. See summary below.

### 2. Briefing Auto-Publish Fix (commit `83c035f`)
- **Found:** A comment in `apps/ingest/sentinel/jobs/generate_briefing.py` incorrectly stated that briefings save as `status='draft'` and require manual approval via `/admin/briefings`.
- **Reality:** The SQL in `apps/ingest/sentinel/db.py:300` already inserts briefings with `status='published'` and `published_at=now()` — they go live instantly.
- **Fixed:** Removed the misleading comment. No functional code changed.
- **Branch:** `claude/document-system-architecture-Mg3GD`

---

## Full System Architecture (Plain English)

### What The Product Is
An automated conflict intelligence dashboard for the Ukraine war. It pulls posts from 30+ OSINT sources, uses Claude AI to extract and verify events, plots them on a live map, and generates AI-written daily briefings.

### Services & Their Roles

| Service | Role |
|---|---|
| **GitHub Actions** | Alarm clock. Triggers ingestion every 30 min; triggers daily briefing at 12:00 and 20:00 UTC. Free. |
| **Render** | Runs two Python worker services: a scheduler (hands out jobs) and a worker (does the actual fetching/processing). ~$10/mo. |
| **Anthropic API (Claude)** | AI brain. Sonnet reads raw posts and extracts structured events. Opus writes the daily briefings. ~$20–30/mo. |
| **Neon** | PostgreSQL database (with PostGIS for geography). Stores everything: raw posts, events, briefings, source list, job queue. ~$5–10/mo. |
| **Vercel** | Hosts the Next.js website. Reads from Neon server-side on every page load. Auto-deploys on git push. ~$20/mo. |
| **Telegram** | Optional read-only ingestion from monitored conflict channels. Free. |

**Total estimated cost: ~$55–70/month**

### Data Flow (Step by Step)
1. GitHub Actions rings every 30 min
2. Render worker fetches new posts from RSS feeds, Telegram channels, and Twitter/X accounts
3. Claude Sonnet reads each raw post → extracts event type, location, confidence level
4. Events saved to Neon database
5. Vercel displays them on the live map automatically
6. Twice daily: Claude Opus reads all recent events → writes a briefing → saves to Neon → appears on site immediately (auto-published)

---

## Current State of Key Features

### Briefing Review & Approval
- **Status: Auto-published.** No human review step exists or is needed unless you want one.
- The database schema has columns for a future review workflow (`draft_text`, `published_text`, `published_by`, `published_at`, `status`) but the frontend admin UI was never built and is not needed given the auto-publish decision.
- If you ever want to add manual review in the future, the DB schema is already set up for it — you'd just need to build a protected `/admin/briefings` page in `apps/web/`.

### What Does NOT Exist (Intentionally)
- No admin UI or login system
- No webhook-based ingestion (everything is pull-based via cron)
- No manual publishing step for briefings

---

## Files Changed This Session

| File | Change |
|---|---|
| `apps/ingest/sentinel/jobs/generate_briefing.py` | Removed stale comment claiming manual approval was required |

---

## Open Questions / Future Work
- The `/admin/briefings` route is referenced in old comments but never built. Decide if you ever want human review before publishing — the DB schema supports it.
- Render vs Railway: `apps/ingest/railway.toml` still exists in the repo but Render is the actual hosting platform. That file can be deleted to avoid confusion.
- `published_by` column in `briefings` table is never populated (no auth system). Either wire it up or leave it null.
