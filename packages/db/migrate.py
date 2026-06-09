#!/usr/bin/env python3
"""Apply pending SQL migrations in packages/db/migrations/ in numeric order.

Tracks applied migrations in a schema_migrations table so re-running is safe.

Commands:
    # apply pending migrations (default)
    DATABASE_URL=postgresql://... python packages/db/migrate.py

    # record migrations through <N> as already-applied WITHOUT running them, then
    # apply everything after <N>. Use ONLY to adopt a pre-existing database whose
    # schema_migrations ledger is empty (e.g. a DB created before this tracking
    # table existed). The number is the numeric prefix, e.g. --baseline 27.
    DATABASE_URL=... python packages/db/migrate.py --baseline 27

    # read-only ledger<->repo drift report; exits non-zero on any drift.
    DATABASE_URL=... python packages/db/migrate.py --verify

Design notes
------------
* The bootstrap footgun (BUG-003 in docs/diagnostics/2026-06-09-bug-sweep.md) is
  gone: an empty ledger never silently marks migrations as applied. A fresh DB
  applies everything from 0001; an already-initialised DB with an empty ledger
  REFUSES to run and tells you to pass --baseline. Silent skipping is forbidden.
* The runner refuses to start if two migration files share a numeric prefix
  (other than the historical, already-applied pairs in GRANDFATHERED_DUPLICATES).
* Pure helpers (numbering, duplicate detection, plan computation, idempotency
  lint) carry no DB dependency and are unit-tested in packages/db/tests/. psycopg
  is imported lazily inside the DB commands so the helpers (and the CI guard that
  reuses them) import with the standard library alone.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"

# A migration filename is NNNN_description.sql. The numeric prefix orders apply.
MIGRATION_RE = re.compile(r"^(\d+)_.*\.sql$")

# Historical same-number pairs that are ALREADY applied in production. New
# duplicates are still hard-errors; these are grandfathered so the runner/guard
# don't brick on pre-existing drift. Closing them:
#   - "0009": the 0009_watches / 0009_stripe_webhook_idempotency pair — resolved
#     by the gated Phase C renumber (issue #217).
#   - "0018": 0018_source_fetch_visibility + the reconstructed
#     0018_lockdown_rls_and_revoke_anon_grants (both applied; see that file).
GRANDFATHERED_DUPLICATES: frozenset[str] = frozenset({"0009", "0018"})

# Historical migrations recovered into the repo after the fact (applied in prod
# long ago, never committed). Exempt from the "new migration number must exceed
# the max on the base branch" CI rule, since their number is intentionally old.
RECONSTRUCTED_MIGRATIONS: frozenset[str] = frozenset(
    {"0018_lockdown_rls_and_revoke_anon_grants.sql"}
)


# ---------------------------------------------------------------------------
# Pure helpers (no DB) — unit-tested in packages/db/tests/test_migrate.py
# ---------------------------------------------------------------------------
def migration_number(filename: str) -> int:
    """Numeric prefix of a migration filename, e.g. '0027_x.sql' -> 27."""
    m = MIGRATION_RE.match(filename)
    if m is None:
        raise ValueError(f"not a migration filename: {filename!r}")
    return int(m.group(1))


def migration_prefix(filename: str) -> str:
    """Raw numeric prefix string, e.g. '0027_x.sql' -> '0027' (keeps width)."""
    m = MIGRATION_RE.match(filename)
    if m is None:
        raise ValueError(f"not a migration filename: {filename!r}")
    return m.group(1)


def list_migration_files(migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Migration filenames sorted by (number, name) — the canonical apply order."""
    files = [p.name for p in migrations_dir.glob("*.sql")]
    return sorted(files, key=lambda n: (migration_number(n), n))


def duplicate_numbers(
    filenames: list[str],
    *,
    grandfathered: frozenset[str] = GRANDFATHERED_DUPLICATES,
) -> dict[str, list[str]]:
    """Map every numeric prefix shared by >1 file to those files, EXCLUDING the
    grandfathered historical pairs. Empty dict == no offending duplicates."""
    by_prefix: dict[str, list[str]] = {}
    for name in filenames:
        by_prefix.setdefault(migration_prefix(name), []).append(name)
    return {
        prefix: sorted(names)
        for prefix, names in by_prefix.items()
        if len(names) > 1 and prefix not in grandfathered
    }


@dataclass
class Plan:
    """What the runner will do. `to_run` = execute SQL + record; `to_mark` =
    record as applied WITHOUT running (baseline adoption only)."""
    to_run: list[str] = field(default_factory=list)
    to_mark: list[str] = field(default_factory=list)
    error: str | None = None


def compute_plan(
    *,
    repo_files: list[str],
    applied: set[str],
    db_initialised: bool,
    baseline: int | None,
) -> Plan:
    """Decide the migration plan without touching the DB. This is the heart of
    the BUG-003 fix: an empty ledger never silently skips pending migrations.

    Cases:
      * Ledger non-empty  -> run every file not yet recorded, in order.
      * Ledger empty + --baseline N -> record files with number <= N (no SQL),
        run the rest. The explicit adoption escape hatch.
      * Ledger empty + fresh DB (not initialised) -> run everything from 0001.
      * Ledger empty + already-initialised DB + no baseline -> REFUSE (error).
    """
    if applied:
        pending = [f for f in repo_files if f not in applied]
        return Plan(to_run=pending)

    if baseline is not None:
        to_mark = [f for f in repo_files if migration_number(f) <= baseline]
        to_run = [f for f in repo_files if migration_number(f) > baseline]
        return Plan(to_run=to_run, to_mark=to_mark)

    if not db_initialised:
        return Plan(to_run=list(repo_files))

    return Plan(
        error=(
            "schema_migrations is empty but the database is already initialised. "
            "Refusing to guess which migrations are applied (silently skipping or "
            "re-running them both risk corruption). Re-run with --baseline <N> to "
            "record migrations through prefix <N> as already-applied, then apply "
            "the rest; use --baseline 0 to force-apply everything from 0001."
        )
    )


# Idempotency lint (BUG-016): NEW migrations should use idempotent DDL so a
# partial-failure replay doesn't crash on an already-created object. Heuristic,
# tuned to avoid false positives on the patterns this repo actually uses.
_NON_IDEMPOTENT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)", re.I),
     "CREATE TABLE without IF NOT EXISTS"),
    (re.compile(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY\s+IF\s+NOT\s+EXISTS)", re.I),
     "CREATE INDEX without IF NOT EXISTS"),
    (re.compile(r"\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)", re.I),
     "ADD COLUMN without IF NOT EXISTS"),
    (re.compile(r"\bCREATE\s+TYPE\s+", re.I),
     "CREATE TYPE (not idempotent; wrap in a guarded DO block)"),
]


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", "", sql)
    return sql


def lint_idempotency(sql: str) -> list[str]:
    """Return human-readable findings for non-idempotent DDL in a NEW migration.
    `CREATE POLICY` is exempt only when the file guards it (policies have no IF
    NOT EXISTS in Postgres, so the convention is a pg_policies existence check)."""
    body = _strip_sql_comments(sql)
    findings = [msg for pat, msg in _NON_IDEMPOTENT_PATTERNS if pat.search(body)]
    if re.search(r"\bCREATE\s+POLICY\b", body, re.I) and "pg_policies" not in body:
        findings.append("CREATE POLICY without a pg_policies existence guard")
    return findings


# ---------------------------------------------------------------------------
# DB commands (psycopg imported lazily so helpers stay dependency-free)
# ---------------------------------------------------------------------------
def _connect(database_url: str):
    import psycopg  # noqa: PLC0415 — lazy so pure helpers/tests need no driver
    return psycopg.connect(database_url)


def _ensure_ledger(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    conn.commit()


def _applied_set(conn) -> set[str]:
    return {row[0] for row in conn.execute("SELECT filename FROM schema_migrations").fetchall()}


def _db_initialised(conn) -> bool:
    return bool(
        conn.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name='sources')"
        ).fetchone()[0]
    )


def _assert_no_duplicates(repo_files: list[str]) -> None:
    dups = duplicate_numbers(repo_files)
    if dups:
        detail = "; ".join(f"{p}: {', '.join(names)}" for p, names in sorted(dups.items()))
        sys.exit(
            f"refusing to run: migration files share a numeric prefix ({detail}). "
            "Renumber so every migration has a unique number (grandfathered "
            f"historical pairs: {', '.join(sorted(GRANDFATHERED_DUPLICATES))})."
        )


def cmd_apply(database_url: str, *, baseline: int | None) -> int:
    repo_files = list_migration_files()
    if not repo_files:
        print("No migration files found.")
        return 0
    _assert_no_duplicates(repo_files)

    with _connect(database_url) as conn:
        _ensure_ledger(conn)
        applied = _applied_set(conn)
        plan = compute_plan(
            repo_files=repo_files,
            applied=applied,
            db_initialised=_db_initialised(conn),
            baseline=baseline,
        )
        if plan.error:
            sys.exit(plan.error)

        for name in plan.to_mark:
            conn.execute(
                "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
                (name,),
            )
            print(f"  baseline (recorded, not run): {name}")
        if plan.to_mark:
            conn.commit()

        if not plan.to_run:
            print("All migrations already applied.")
            return 0

        for name in plan.to_run:
            print(f"Applying {name}...")
            conn.execute((MIGRATIONS_DIR / name).read_text())
            conn.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (name,))
            conn.commit()
            print(f"  done: {name}")
    return 0


def cmd_verify(database_url: str) -> int:
    """Read-only ledger<->repo drift report. Non-zero exit on any drift."""
    repo_files = list_migration_files()
    repo_set = set(repo_files)

    drift = False
    dups = duplicate_numbers(repo_files)
    if dups:
        drift = True
        for prefix, names in sorted(dups.items()):
            print(f"DUPLICATE NUMBER {prefix}: {', '.join(names)}")

    with _connect(database_url) as conn:
        _ensure_ledger(conn)
        applied = _applied_set(conn)

    pending = [f for f in repo_files if f not in applied]
    ghosts = sorted(applied - repo_set)
    for f in pending:
        print(f"PENDING (in repo, not applied): {f}")
    for f in ghosts:
        print(f"GHOST (in ledger, no file): {f}")
    if pending or ghosts:
        drift = True

    if drift:
        print("verify: DRIFT detected.")
        return 1
    print(f"verify: clean ({len(applied)} applied, no pending, no ghosts, no duplicates).")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply/verify SQL migrations.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--verify", action="store_true",
                       help="read-only ledger<->repo drift report; non-zero exit on drift")
    group.add_argument("--baseline", type=int, metavar="N",
                       help="adopt a pre-existing DB: record migrations through prefix N "
                            "as applied without running them, then apply the rest")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL environment variable is required")

    if args.verify:
        sys.exit(cmd_verify(database_url))
    sys.exit(cmd_apply(database_url, baseline=args.baseline))


if __name__ == "__main__":
    main()
