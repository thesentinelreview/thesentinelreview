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

## Known historical exceptions (grandfathered; closing)

These pre-date the hygiene gate, are already applied in prod, and are allow-listed
in `migrate.py` so the runner/guard don't brick on them. New occurrences are still
hard-errors.

| # | Files | Status |
|---|---|---|
| `0009` | `0009_watches.sql`, `0009_stripe_webhook_idempotency.sql` | Duplicate number. Renumber is the gated **Phase C** of issue #217 (renames + lockstep `schema_migrations` UPDATE against prod). |
| `0018` | `0018_source_fetch_visibility.sql`, `0018_lockdown_rls_and_revoke_anon_grants.sql` | Duplicate number after the Phase B reconstruction of the second file (it was applied to prod but never committed). Both applied; left grandfathered. |

`RECONSTRUCTED_MIGRATIONS` in `migrate.py` exempts `0018_lockdown_…` from the
"number must exceed base max" rule, since recovering a historical migration
necessarily reuses an old number.
