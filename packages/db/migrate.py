#!/usr/bin/env python3
"""Apply pending SQL migrations in packages/db/migrations/ in alphabetical order.

Tracks applied migrations in a schema_migrations table so re-running is safe.

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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        conn.commit()

        applied = {
            row[0]
            for row in conn.execute("SELECT filename FROM schema_migrations").fetchall()
        }

        # Bootstrap: if schema_migrations is empty but the DB is already initialised
        # (sources table exists), mark all migrations that exist on disk as applied
        # EXCEPT the current batch — we only skip migrations older than the newest
        # file that hasn't been recorded. This handles the case where the DB was set
        # up before this tracking table existed.
        if not applied:
            already_initialised = conn.execute(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources')"
            ).fetchone()[0]  # type: ignore[index]

            if already_initialised:
                print("Bootstrapping schema_migrations for pre-existing database...")
                # Mark all but the last migration as already applied — conservative:
                # try to apply the last one so genuinely new migrations still run.
                # In practice, treat everything before the final file as applied.
                all_files = sorted(migration_files, key=lambda p: p.name)
                to_bootstrap = all_files[:-1]
                for path in to_bootstrap:
                    conn.execute(
                        "INSERT INTO schema_migrations (filename) VALUES (%s) ON CONFLICT DO NOTHING",
                        (path.name,),
                    )
                    print(f"  bootstrapped (skipping): {path.name}")
                conn.commit()
                # Refresh applied set
                applied = {
                    row[0]
                    for row in conn.execute("SELECT filename FROM schema_migrations").fetchall()
                }

        pending = [p for p in migration_files if p.name not in applied]

        if not pending:
            print("All migrations already applied.")
            return

        for path in pending:
            print(f"Applying {path.name}...")
            conn.execute(path.read_text())
            conn.execute(
                "INSERT INTO schema_migrations (filename) VALUES (%s)",
                (path.name,),
            )
            conn.commit()
            print(f"  done: {path.name}")


if __name__ == "__main__":
    main()
