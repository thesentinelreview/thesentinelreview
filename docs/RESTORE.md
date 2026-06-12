# Restoring a database backup

The `Sentinel — DB Backup to R2` workflow (`.github/workflows/sentinel-db-backup.yml`)
takes a nightly logical backup of the production Supabase database:
`pg_dump --format=custom --schema=public`, uploaded to the R2 bucket
(`sentinel-db-backups`) under keys like

```
pg/17/2026/06/sentinel_public_20260611T024700Z.dump
```

`pg/` is the lifecycle (retention) prefix; `17` is the Postgres major version the
dump was taken from — restore with `pg_restore` of at least that major.

## 1. Fetch the dump

```sh
export AWS_ACCESS_KEY_ID=...        # R2 token credentials
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required   # aws-cli >= 2.23 vs R2
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

aws s3 ls "s3://sentinel-db-backups/pg/17/" --recursive \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
aws s3 cp "s3://sentinel-db-backups/<KEY>" backup.dump \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
```

Inspect before restoring — this also validates the archive is readable:

```sh
pg_restore --list backup.dump
```

## 2. Prerequisites on the restore target

The dump contains **only schema `public`** (tables, data, indexes, views, the
`source_reliability` materialized view, functions, sequences, RLS policies, and
`schema_migrations` bookkeeping). Four things are deliberately NOT in it and
must exist on the target first:

1. **Extensions.** `--schema=public` excludes `CREATE EXTENSION`. Before
   restoring, enable the extensions from `packages/db/migrations/0001_init.sql`:

   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```

   Verify with `\dx` that they install into the same schema as on the source so
   schema-qualified type references (e.g. `geometry`) resolve.

2. **Supabase roles.** RLS policies and grants in the dump reference `anon`,
   `authenticated`, and `service_role`. Restore into a Supabase project (where
   they always exist); on vanilla Postgres, create those roles first or the
   policy/grant statements fail.

3. **pg_cron schedules.** The `cron` schema is outside the dump. After
   restoring, re-run the `DO $$ ... cron.schedule(...) $$` blocks from
   migrations `0014_schedule_source_reliability_refresh.sql`,
   `0028_source_health_function.sql`, and `0034_watchdog.sql`. The
   `supabase_realtime` publication (publications aren't schema-scoped) is
   likewise not in the dump; recreate it only if realtime is in use.

4. **Watchdog dependencies (migration `0034`).** The staleness watchdog needs
   `pg_cron` + `pg_net` enabled on the target (Dashboard → Database →
   Extensions; the function bodies restore fine without them, but alerts stay
   ledger-only until both exist) and the Supabase Vault secret
   `github_watchdog_pat` re-created by hand (Dashboard → Vault — the `vault`
   schema is outside the dump, and the PAT value is never stored anywhere
   else). Until the secret exists, `watchdog_check()` records `notify_error`
   in `watchdog_alerts.details` instead of filing GitHub issues.

## 3. Restore

```sh
pg_restore \
  --dbname="$TARGET_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  backup.dump
```

- `--no-owner` / `--no-privileges` belong **here**, not on `pg_dump` — for
  custom-format archives they are no-ops at dump time; the archive always
  records owner/ACL info and the restore decides whether to apply it. Restoring
  as the target's `postgres` role with these flags makes that role own
  everything, which is what the app expects (`apps/web/lib/db.ts` connects as
  the owner).
- `--exit-on-error` because pg_restore's default is to plow through errors and
  still exit successfully-ish.
- If the target's `public` schema is not empty, either restore into a fresh
  project (preferred) or add `--clean --if-exists` and accept that objects not
  in the dump are left behind.
- From IPv4-only environments (e.g. GitHub Actions runners) use the Supabase
  **session pooler** URL (port 5432) — same constraint as the dump. Never the
  transaction pooler (port 6543).

## 4. Verify after restore

```sql
SELECT count(*) FROM events;
SELECT count(*) FROM raw_posts;
SELECT max(version) FROM schema_migrations;
REFRESH MATERIALIZED VIEW source_reliability;  -- proves matview + deps restored
```

Counts should match the source at backup time; the max migration version should
match the latest applied migration in `packages/db/migrations/`.

> **Drill:** a backup that has never been restored is theater. Run a quarterly
> restore drill into a scratch Supabase project; `pg_restore --list` in the
> nightly workflow validates the archive, not restorability.
