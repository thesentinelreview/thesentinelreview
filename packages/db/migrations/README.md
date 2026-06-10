# Database migrations

Numbered SQL migrations applied in order by [`../migrate.py`](../migrate.py). The
applied set is tracked in the `schema_migrations(filename, applied_at)` ledger.

## Policy (enforced by CI — `../check_migrations.py`, `.github/workflows/ci-migrations.yml`)

1. **Unique, monotonic numbers.** Each migration is `NNNN_description.sql`. No two
   files may share a numeric prefix, and a new migration's number must be greater
   than the highest number already on `main`. This is the guard that would have
   caught the `0028` collision when a PR sat on a stale base — **rebase before
   adding a migration** so your number is actually next.
2. **Forward-only; applied migrations are immutable.** Never edit the content of a
   migration that has merged/been applied. Fix a mistake with a *new* migration.
   CI fails any content change to a file that already exists on `main`.
3. **Idempotent DDL in new migrations.** Use `CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`; guard `CREATE POLICY`
   / `CREATE TYPE` and role/grant statements in `DO $$ ... END $$` existence
   checks (see `0011_harden_db.sql`, `0018_lockdown_rls_and_revoke_anon_grants.sql`
   for the house style). So a partial-failure replay never crashes on an
   already-created object.

## Runner usage

```bash
# apply pending migrations
DATABASE_URL=postgresql://... python packages/db/migrate.py

# read-only ledger<->repo drift report (pending files, ghost ledger rows,
# duplicate numbers); non-zero exit on drift. Run after deploys.
DATABASE_URL=... python packages/db/migrate.py --verify

# adopt a pre-existing DB whose ledger is EMPTY: record migrations through prefix
# N as applied WITHOUT running them, then apply the rest. Use --baseline 0 to
# force-apply everything from 0001.
DATABASE_URL=... python packages/db/migrate.py --baseline 27
```

### Bootstrap safety (BUG-003)

An empty `schema_migrations` never silently skips pending migrations. A fresh DB
applies everything from `0001`; an **already-initialised** DB with an empty ledger
**refuses to run** and tells you to pass `--baseline <N>`. (The old behaviour
marked all-but-the-last file as applied without running them — silent schema
drift on any restore.)

## Known historical exceptions (grandfathered — permanent)

These two duplicate-number pairs pre-date the hygiene gate, are already applied in
prod, and are allow-listed in `GRANDFATHERED_DUPLICATES` in `migrate.py` so the
runner/guard don't brick on them. **New** duplicates are still hard-errors.

**Decision (issue #217, Phase C): grandfather, do not renumber.** A renumber was
considered and rejected — there is no free integer slot adjacent to `0009`
(`0009_watches` must stay `< 0010` because `0010_enable_rls` enables RLS on
`watches` unguarded; every slot 0008–0018 is occupied), so strict uniqueness would
require a 20-file cascade rename plus a lockstep `schema_migrations` rewrite — high
risk for zero functional gain. The two files in each pair are **independent** (no
inter-dependency), so apply order between them is irrelevant; and `migrate.py`
orders them **deterministically by (number, filename)** — i.e. plain ASCII
filename sort within the shared number — so the order is stable across machines.

| # | Apply order (deterministic, alpha-sorted within the number) | Why it's safe |
|---|---|---|
| `0009` | `0009_stripe_webhook_idempotency.sql` → `0009_watches.sql` | Independent tables (`processed_stripe_events`, `watches`); either order is valid. Both `< 0010`, so `watches` exists before `0010_enable_rls` touches it. |
| `0018` | `0018_lockdown_rls_and_revoke_anon_grants.sql` → `0018_source_fetch_visibility.sql` | Independent (one does RLS lockdown, the other adds `sources.last_fetch_at`). The first is the Phase B reconstruction (applied to prod, never committed); both applied. |

`RECONSTRUCTED_MIGRATIONS` in `migrate.py` exempts `0018_lockdown_…` from the
"number must exceed base max" rule, since recovering a historical migration
necessarily reuses an old number.

## Data API grant posture (anon / authenticated)

**Decision (2026-06-10, recorded here because applied migrations are immutable —
this cannot live in `0030`'s header):** the `public` schema is **fully locked
down to the Supabase Data API roles**. Migration `0030_capture_oob_and_revoke_anon`
revokes ALL privileges on every `public` table/sequence/function from **both
`anon` and `authenticated`** (extending `0018`'s anon-focused intent to
`authenticated` as well).

This is **intentional hardening, verified safe**, not a side effect:
- The web app connects only as the `postgres` owner role over the pooler
  (`apps/web/lib/db.ts` uses node-`pg` with `DATABASE_URL`). There is **no**
  `@supabase/supabase-js`/`createClient`/PostgREST/`NEXT_PUBLIC_SUPABASE_*` usage
  anywhere in the repo, **no Edge Functions**, and auth is Clerk (not Supabase
  Auth) — so nothing ever authenticates as `anon`/`authenticated`.
- Post-apply sweep (2026-06-10): Postgres + PostgREST logs show **zero `42501`
  permission-denied** and no Data-API traffic since the apply.

**Rollback** (only if a client-side Data-API path is ever introduced) — restore the
pre-`0030` Supabase auto-grant state:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON briefings, dedup_decisions, event_sources, events, jobs, llm_logs,
     raw_posts, sources, user_subscriptions, watches TO anon;
GRANT SELECT, REFERENCES, TRIGGER
  ON admin_audit_log, candidate_mentions, candidate_sources,
     processed_stripe_events, schema_migrations TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- and the Supabase sequence/function defaults (exact pre-state not captured as rows):
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
```
Note this restores *Supabase defaults*, not a hand-designed grant set — the
pre-`0030` grants were auto-created by Supabase, not by app design.

## Process: migrations that touch grants / RLS / roles (REQUIRED)

Any migration altering `GRANT`/`REVOKE`, RLS, policies, or roles MUST, before it is
reported green:
1. **Capture full before-state as rows** (not counts) and paste them into the PR —
   `grantee, table_name, privilege_type` from `information_schema.role_table_grants`
   (plus sequence/function grants), and `pg_policies` / `relrowsecurity` as
   relevant. A row-level snapshot is the only thing that makes rollback exact.
2. **Run a product smoke test in post-checks** — at minimum the watchfloor (`/`)
   and `/app/feed` load, plus one authenticated read path — and report the result.
   "Ledger reconciled" / "`--verify` clean" is **not** "the app still works."
