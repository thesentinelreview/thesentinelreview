# The Sentinel Review — Claude Code session guide

Conflict-monitoring pipeline: GitHub Actions fetch posts from 53 OSINT sources every 30 min,
run LLM extraction via Anthropic API, and write conflict events to a Supabase Postgres database
(project `ugpqgfvdqupttqhogavc`, region `eu-west-2`). A Next.js dashboard on Vercel serves the
data to subscribers. The ingest workflow runs `sentinel-preflight` first, which aborts if
`DATABASE_URL` doesn't point at the expected Supabase host
(`apps/ingest/sentinel/preflight.py`, added after the 2026-05-25 rogue-host incident).

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

## Secrets used by workflows

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (session-mode pooler, `aws-1-eu-west-2.pooler.supabase.com:5432`) |
| `ANTHROPIC_API_KEY` | LLM calls (extraction + briefings) |
| `SENTINEL_ALERT_WEBHOOK_URL` | Slack-compatible alert webhook posted to on critical integrity failure |

## Branch and PR conventions

- Branch: `fix/<short-description>` (e.g. `fix/rss-timeout`, `fix/migration-0008`)
- PR title: `fix: <what broke and how>`
- Keep PRs small — one issue per PR
