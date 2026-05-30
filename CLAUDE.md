# The Sentinel Review — Claude Code session guide

Conflict-monitoring pipeline: GitHub Actions fetch posts from 53 OSINT sources every 30 min,
run LLM extraction via Anthropic API, and write conflict events to the production database.
A Next.js dashboard on Vercel serves the data to subscribers.

Data layer: **Supabase** (Postgres 17.6, project `ugpqgfvdqupttqhogavc` "Sentinel Map",
eu-west-2) is the single production DB for both the ingest pipeline and the dashboard.
Access via `DATABASE_URL` (pooler `aws-1-eu-west-2.pooler.supabase.com`).

## If this session was triggered by a pipeline failure issue

1. **Find the triggering issue** — list open issues with titles starting `pipeline failure:` and
   pick the most recent one. It contains the workflow name and a direct link to the failed run.

2. **Fetch the run logs** — use `mcp__github__` tools to get the workflow run and read the output
   of the failing step.

3. **Diagnose** — trace the error to source (see code map below).

4. **Fix** — push a minimal fix to `fix/<short-description>` and open a PR. No unrelated cleanup.

5. **Close the issue** — comment with the PR link, then close the issue.

## Code map

| Symptom | Where to look |
|---|---|
| Migration failure | `packages/db/migrate.py`, `packages/db/migrations/` |
| DB connection error | `apps/ingest/sentinel/db.py`, `apps/ingest/sentinel/config.py` |
| RSS / feed ingestor | `apps/ingest/sentinel/ingestors/rss.py` |
| Telegram ingestor | `apps/ingest/sentinel/ingestors/telegram.py` |
| X (Twitter) ingestor | `apps/ingest/sentinel/ingestors/x.py` |
| LLM extraction / scoring | `apps/ingest/sentinel/pipeline/extractor.py`, `scorer.py` |
| Deduplication | `apps/ingest/sentinel/pipeline/dedup.py` |
| Job runner / scheduler | `apps/ingest/sentinel/runner.py`, `scheduler.py`, `worker.py` |
| Integrity check exit 1 | `apps/ingest/sentinel/checks.py` — a *critical* check failed; the run log shows which one |
| Next.js dashboard | `apps/web/` — read `apps/web/AGENTS.md` before touching any Next.js code |

## Database

Production = Supabase project `ugpqgfvdqupttqhogavc` ("Sentinel Map"). All ingest
writes and dashboard reads go here. Ingest preflight verifies the DB host contains
`supabase.co` before running.

⚠️ Do NOT use Neon. Project `tiny-night-97017367` ("Sentinel Dashboard", endpoint
`ep-empty-leaf-ap4p0pzo`, us-east-1) is a rogue/disposable copy from the
2026-05-24→26 incident, auto-deleting on/after 2026-06-01. Never read it, never
write it, never treat it as production. Any tool or doc pointing at Neon as the app
DB is stale.

## Secrets used by workflows

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string |
| `ANTHROPIC_API_KEY` | LLM calls (extraction + briefings) |
| `SENTINEL_ALERT_WEBHOOK_URL` | Slack-compatible alert webhook posted to on critical integrity failure |

## Branch and PR conventions

- Branch: `fix/<short-description>` (e.g. `fix/rss-timeout`, `fix/migration-0008`)
- PR title: `fix: <what broke and how>`
- Keep PRs small — one issue per PR
