# Sentinel Shield — Quickstart

## Requirements
- Docker 24+ and Docker Compose v2

## Run

```bash
git clone <repo>
cd sentinel-shield
docker compose up --build
```

Open http://localhost:3000

## AI Features

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to enable AI triage and investigation features (alert summaries, incident analysis, playbook suggestions).

## What happens on first run

1. `postgres` — starts the database
2. `migrate` — applies the schema (`db/migrations/0001_init.sql`)
3. `seed` — loads realistic fake data (`db/seed/seed.sql`)
4. `dashboard` — builds and starts the Next.js app on port 3000

The seed step is idempotent — re-running `docker compose up` is safe.
