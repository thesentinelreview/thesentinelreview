"""Put packages/db on sys.path so tests import migrate / check_migrations
directly. These are pure-logic tests — no database, no driver required."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
