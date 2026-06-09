#!/usr/bin/env python3
"""CI guard for migration hygiene — runs on every PR, needs no database.

Catches, against the base branch (default origin/main):
  1. Duplicate numeric prefixes (excluding the grandfathered historical pairs).
  2. A NEW migration whose number is <= the max already on the base branch —
     the check that would have caught the 0028 collision while a PR sat on a
     stale base. Reconstructed historical migrations are exempt.
  3. Non-idempotent DDL in NEW migrations (BUG-016).
  4. Edits to the CONTENT of an already-merged migration (applied migrations are
     immutable; only renames — handled in the gated Phase C — and additive
     reconstruction are allowed).

The pure `check()` takes base/head filename->content maps so it is unit-tested
without git; `load_from_git()` is the thin CI adapter.

Exit code 0 == clean, 1 == violations.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from migrate import (  # noqa: E402
    RECONSTRUCTED_MIGRATIONS,
    duplicate_numbers,
    lint_idempotency,
    migration_number,
)

MIGRATIONS_PREFIX = "packages/db/migrations/"


def check(base_files: dict[str, str], head_files: dict[str, str]) -> list[str]:
    """Return a list of violation messages (empty == clean)."""
    violations: list[str] = []
    head_names = sorted(head_files)

    # 1. Duplicate numbers (minus grandfathered pairs).
    for prefix, names in sorted(duplicate_numbers(head_names).items()):
        violations.append(f"duplicate migration number {prefix}: {', '.join(names)}")

    base_max = max((migration_number(n) for n in base_files), default=0)
    added = [n for n in head_names if n not in base_files]

    for name in added:
        # 2. Monotonic numbering for genuinely new migrations.
        if name not in RECONSTRUCTED_MIGRATIONS and migration_number(name) <= base_max:
            violations.append(
                f"new migration {name} (number {migration_number(name)}) is <= the max "
                f"on the base branch ({base_max}); rebase and renumber so it is greater "
                f"(this is the 0028-collision guard)"
            )
        # 3. Idempotency lint for new migrations.
        for finding in lint_idempotency(head_files[name]):
            violations.append(f"non-idempotent DDL in {name}: {finding}")

    # 4. Immutability of already-merged migrations.
    for name in sorted(set(base_files) & set(head_files)):
        if base_files[name] != head_files[name]:
            violations.append(
                f"migration {name} was modified; already-applied migrations are "
                f"immutable (forward-only — write a new migration instead)"
            )

    return violations


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def load_from_git(base_ref: str) -> tuple[dict[str, str], dict[str, str]]:
    """(base_files, head_files) as name->content maps for the migrations dir."""
    base_files: dict[str, str] = {}
    listing = _git("ls-tree", "-r", "--name-only", base_ref, "--", MIGRATIONS_PREFIX)
    for path in filter(None, listing.splitlines()):
        if path.endswith(".sql"):
            base_files[Path(path).name] = _git("show", f"{base_ref}:{path}")

    head_files: dict[str, str] = {}
    for p in (Path(__file__).parent / "migrations").glob("*.sql"):
        head_files[p.name] = p.read_text()
    return base_files, head_files


def main() -> int:
    base_ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    try:
        base_files, head_files = load_from_git(base_ref)
    except subprocess.CalledProcessError as exc:
        print(f"could not read base ref {base_ref!r}: {exc.stderr or exc}", file=sys.stderr)
        return 2
    violations = check(base_files, head_files)
    if violations:
        print(f"migration hygiene check FAILED ({len(violations)} issue(s)) vs {base_ref}:")
        for v in violations:
            print(f"  - {v}")
        return 1
    print(f"migration hygiene check passed vs {base_ref} ({len(head_files)} migrations).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
