"""
Shared fixtures and test configuration for sentinel-ingest tests.

All tests that touch sentinel.config or sentinel.pipeline.* are guarded behind
an env-var patch so the module-level `settings = Settings()` call succeeds
without real credentials.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Patch env vars before any sentinel module is imported
# ---------------------------------------------------------------------------

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-key")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def make_source(
    *,
    platform: str = "telegram",
    trust_tier: int = 2,
    handle: str = "TestChannel",
    display_name: str = "Test Channel",
) -> dict:
    return {
        "id": uuid.uuid4(),
        "handle": handle,
        "platform": platform,
        "display_name": display_name,
        "trust_tier": trust_tier,
        "is_active": True,
    }


@pytest.fixture()
def source_t2_telegram() -> dict:
    return make_source(platform="telegram", trust_tier=2)


@pytest.fixture()
def source_t1_rss() -> dict:
    return make_source(platform="rss", trust_tier=1, handle="reuters", display_name="Reuters")
