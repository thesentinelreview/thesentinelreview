from pathlib import Path

import pytest

from bsky_osint.config import load_config
from bsky_osint.discovery import DiscoveryEngine, _window_since
from bsky_osint.bluesky_client import BlueskyClient
from unittest.mock import MagicMock
from datetime import datetime, timezone, timedelta

_CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"


@pytest.fixture
def cfg():
    return load_config(_CONFIG_PATH)


@pytest.fixture
def engine(cfg):
    client = MagicMock(spec=BlueskyClient)
    return DiscoveryEngine(client, cfg)


def test_ukraine_queries_contain_region_terms(engine):
    queries = engine.build_queries("Ukraine", window_days=7)
    assert len(queries) > 0
    all_terms = " ".join(q for q, _ in queries)
    assert "Ukraine" in all_terms or "Україна" in all_terms or "Украина" in all_terms


def test_iran_queries_contain_iran(engine):
    queries = engine.build_queries("Iran", window_days=7)
    all_terms = " ".join(q for q, _ in queries)
    assert "Iran" in all_terms


def test_sudan_queries_contain_sudan(engine):
    queries = engine.build_queries("Sudan", window_days=7)
    all_terms = " ".join(q for q, _ in queries)
    assert "Sudan" in all_terms


def test_myanmar_queries_contain_myanmar(engine):
    queries = engine.build_queries("Myanmar", window_days=7)
    all_terms = " ".join(q for q, _ in queries)
    assert "Myanmar" in all_terms or "Burma" in all_terms


def test_unknown_region_returns_empty(engine):
    queries = engine.build_queries("Atlantis", window_days=7)
    assert queries == []


def test_window_since_24h():
    since_str = _window_since(1)
    dt = datetime.fromisoformat(since_str.replace("Z", "+00:00"))
    now = datetime.now(tz=timezone.utc)
    diff = now - dt
    assert timedelta(hours=23) < diff < timedelta(hours=25)


def test_window_since_7d():
    since_str = _window_since(7)
    dt = datetime.fromisoformat(since_str.replace("Z", "+00:00"))
    now = datetime.now(tz=timezone.utc)
    diff = now - dt
    assert timedelta(days=6, hours=23) < diff < timedelta(days=7, hours=1)


def test_multi_phrase_queries_quoted(engine):
    queries = engine.build_queries("Ukraine", window_days=7)
    # at least some queries should contain quoted phrases
    all_q = " ".join(q for q, _ in queries)
    assert '"' in all_q
