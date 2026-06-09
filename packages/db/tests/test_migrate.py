"""Pure-logic tests for migrate.py — no database required (CI-runnable).

Covers the BUG-003 bootstrap fix: an empty ledger must never silently skip
pending migrations.
"""
from __future__ import annotations

import migrate


# ---------------------------------------------------------------------------
# numbering / duplicates
# ---------------------------------------------------------------------------
def test_migration_number_and_prefix():
    assert migrate.migration_number("0027_x.sql") == 27
    assert migrate.migration_prefix("0027_x.sql") == "0027"
    assert migrate.migration_number("0009_watches.sql") == 9


def test_duplicate_numbers_grandfathered_pairs_excluded():
    files = [
        "0009_watches.sql",
        "0009_stripe_webhook_idempotency.sql",
        "0018_source_fetch_visibility.sql",
        "0018_lockdown_rls_and_revoke_anon_grants.sql",
        "0029_theater_integrity.sql",
    ]
    # 0009 and 0018 are grandfathered historical pairs -> not reported.
    assert migrate.duplicate_numbers(files) == {}


def test_duplicate_numbers_detects_new_collision():
    files = ["0029_theater_integrity.sql", "0029_something_else.sql"]
    dups = migrate.duplicate_numbers(files)
    assert "0029" in dups
    assert dups["0029"] == ["0029_something_else.sql", "0029_theater_integrity.sql"]


# ---------------------------------------------------------------------------
# compute_plan — the bootstrap fix
# ---------------------------------------------------------------------------
FILES = ["0001_init.sql", "0002_a.sql", "0003_b.sql"]


def test_empty_ledger_initialised_db_without_baseline_refuses():
    """The BUG-003 regression guard: an already-initialised DB with an empty
    ledger and no --baseline must REFUSE, never silently skip."""
    plan = migrate.compute_plan(
        repo_files=FILES, applied=set(), db_initialised=True, baseline=None
    )
    assert plan.error is not None
    assert plan.to_run == [] and plan.to_mark == []
    assert "baseline" in plan.error


def test_empty_ledger_fresh_db_applies_everything():
    plan = migrate.compute_plan(
        repo_files=FILES, applied=set(), db_initialised=False, baseline=None
    )
    assert plan.error is None
    assert plan.to_run == FILES
    assert plan.to_mark == []


def test_baseline_marks_through_n_and_runs_the_rest():
    plan = migrate.compute_plan(
        repo_files=FILES, applied=set(), db_initialised=True, baseline=2
    )
    assert plan.error is None
    assert plan.to_mark == ["0001_init.sql", "0002_a.sql"]
    assert plan.to_run == ["0003_b.sql"]


def test_baseline_zero_force_applies_all():
    plan = migrate.compute_plan(
        repo_files=FILES, applied=set(), db_initialised=True, baseline=0
    )
    assert plan.to_mark == []
    assert plan.to_run == FILES


def test_nonempty_ledger_runs_only_pending_including_low_numbers():
    """A pending low-numbered file must still run — never skipped (the old
    all_files[:-1] bug would have dropped it)."""
    plan = migrate.compute_plan(
        repo_files=FILES,
        applied={"0001_init.sql", "0003_b.sql"},
        db_initialised=True,
        baseline=None,
    )
    assert plan.error is None
    assert plan.to_run == ["0002_a.sql"]
    assert plan.to_mark == []


# ---------------------------------------------------------------------------
# idempotency lint
# ---------------------------------------------------------------------------
def test_lint_flags_non_idempotent_ddl():
    sql = "CREATE TABLE foo (id int);\nCREATE INDEX foo_idx ON foo (id);"
    findings = migrate.lint_idempotency(sql)
    assert any("CREATE TABLE" in f for f in findings)
    assert any("CREATE INDEX" in f for f in findings)


def test_lint_passes_idempotent_ddl():
    sql = (
        "CREATE TABLE IF NOT EXISTS foo (id int);\n"
        "CREATE INDEX IF NOT EXISTS foo_idx ON foo (id);\n"
        "ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar text;"
    )
    assert migrate.lint_idempotency(sql) == []


def test_lint_create_policy_requires_guard():
    assert migrate.lint_idempotency("CREATE POLICY p ON foo FOR ALL USING (true);")
    guarded = (
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='p') "
        "THEN CREATE POLICY p ON foo FOR ALL USING (true); END IF; END $$;"
    )
    assert migrate.lint_idempotency(guarded) == []


def test_lint_ignores_commented_ddl():
    assert migrate.lint_idempotency("-- CREATE TABLE foo (id int);") == []
