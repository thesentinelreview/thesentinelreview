#!/usr/bin/env python3
"""Apply all SQL migrations in packages/db/migrations/ in alphabetical order.

Usage:
    DATABASE_URL=postgresql://user:pass@host/db python packages/db/migrate.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL environment variable is required")

    migrations_dir = Path(__file__).parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        print("No migration files found.")
        return

    with psycopg.connect(database_url) as conn:
        for path in migration_files:
            print(f"Applying {path.name}...")
            conn.execute(path.read_text())
            conn.commit()
            print(f"  done: {path.name}")


if __name__ == "__main__":
    main()
