"""Tests for the PR migration-hygiene guard (check_migrations.check).

Includes the required synthetic-duplicate test: the guard must fail when two
migrations share a number — the check that backstops the runner's assertion and
would have caught the 0028 collision.
"""
from __future__ import annotations

import check_migrations

# A realistic base branch: monotonic, no duplicates.
BASE = {
    "0001_init.sql": "CREATE TABLE IF NOT EXISTS sources (id int);",
    "0027_x.sql": "ALTER TABLE sources ADD COLUMN IF NOT EXISTS a int;",
    "0028_source_health_function.sql": "-- fn",
}


def test_clean_addition_passes():
    head = {**BASE, "0029_theater_integrity.sql": "ALTER TABLE sources ADD COLUMN IF NOT EXISTS b int;"}
    assert check_migrations.check(BASE, head) == []


def test_synthetic_duplicate_number_fails():
    """REQUIRED: a duplicate prefix must be rejected."""
    head = {
        **BASE,
        "0029_theater_integrity.sql": "-- a",
        "0029_conflicting_change.sql": "-- b",
    }
    violations = check_migrations.check(BASE, head)
    assert any("duplicate migration number 0029" in v for v in violations)


def test_number_not_greater_than_base_max_fails():
    """The 0028-collision guard: a new file numbered <= base max is rejected."""
    head = {**BASE, "0028_colliding.sql": "-- collides with base 0028"}
    violations = check_migrations.check(BASE, head)
    assert any("is <= the max on the base branch" in v for v in violations)


def test_reconstructed_migration_is_exempt_from_monotonic_rule():
    """The recovered historical 0018 keeps its old number without tripping the
    monotonic guard."""
    head = {
        **BASE,
        "0018_lockdown_rls_and_revoke_anon_grants.sql": (
            "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') "
            "THEN REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon; END IF; END $$;"
        ),
    }
    assert check_migrations.check(BASE, head) == []


def test_editing_applied_migration_fails():
    """Already-merged migrations are immutable."""
    head = {**BASE, "0001_init.sql": "CREATE TABLE IF NOT EXISTS sources (id bigint);"}
    violations = check_migrations.check(BASE, head)
    assert any("immutable" in v for v in violations)


def test_non_idempotent_new_migration_fails():
    head = {**BASE, "0029_new.sql": "CREATE TABLE widgets (id int);"}
    violations = check_migrations.check(BASE, head)
    assert any("non-idempotent DDL in 0029_new.sql" in v for v in violations)
