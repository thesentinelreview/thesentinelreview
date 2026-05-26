"""DB identity preflight.

Verifies that the configured DATABASE_URL points at the expected database host
*before* any migration or query runs. Guards against a misconfigured secret
silently directing the pipeline at the wrong database (see the 2026-05-25
incident, where DATABASE_URL pointed at a rogue host for hours while every
integrity check stayed green because each queries whichever DB it is given).

Reads DATABASE_URL directly from the environment rather than via sentinel.config
so an unset value exits 1 with a clear message instead of a pydantic traceback,
and so the host we assert on is exactly the URL we connect with.
"""
from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

import psycopg
import structlog

log = structlog.get_logger()

DEFAULT_EXPECTED_HOST_SUBSTRING = "supabase.co"


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.BoundLogger,
        logger_factory=structlog.PrintLoggerFactory(),
    )


def verify_database_target() -> None:
    _configure_logging()

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        log.error("db_target_unset", error="DATABASE_URL is not set")
        sys.exit(1)

    # urlparse(...).hostname returns the host only (no credentials), so logging
    # it never leaks the password embedded in the URL.
    hostname = urlparse(database_url).hostname or ""
    expected = (
        os.environ.get("EXPECTED_DB_HOST_SUBSTRING", "").strip()
        or DEFAULT_EXPECTED_HOST_SUBSTRING
    )

    if expected not in hostname:
        log.error(
            "db_identity_mismatch",
            error="DB IDENTITY MISMATCH",
            expected_substring=expected,
            parsed_hostname=hostname or "(unparseable)",
        )
        sys.exit(1)

    try:
        with psycopg.connect(database_url) as conn:
            row = conn.execute(
                "SELECT current_database(), inet_server_addr()::text, version()"
            ).fetchone()
    except Exception as exc:
        log.error("db_target_connect_failed", error=str(exc))
        sys.exit(1)

    assert row is not None
    current_database, server_addr, version = row
    log.info(
        "db_target_verified",
        current_database=current_database,
        server_addr=server_addr,
        version=version,
        expected_substring=expected,
        parsed_hostname=hostname,
    )
    sys.exit(0)
