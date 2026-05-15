"""
Batches telemetry events and ships them to the Shield server via HTTPS.
Falls back to a local SQLite buffer if the server is unreachable.
"""

from __future__ import annotations

import json
import queue
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import config

log = structlog.get_logger()

_BUFFER_PATH = Path("~/.sentinel-agent/buffer.db").expanduser()
_BUFFER_PATH.parent.mkdir(parents=True, exist_ok=True)


def _init_buffer() -> sqlite3.Connection:
    db = sqlite3.connect(str(_BUFFER_PATH))
    db.execute(
        "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, payload TEXT, created_at REAL)"
    )
    db.commit()
    return db


class Reporter:
    def __init__(self, event_queue: queue.Queue[dict[str, Any]], sensor_id: uuid.UUID) -> None:
        self._q = event_queue
        self._sensor_id = sensor_id
        self._buffer = _init_buffer()
        self._client = httpx.Client(
            base_url=config.server_url,
            headers={"Authorization": f"Bearer {config.api_key}"},
            timeout=15.0,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=16))
    def _ship(self, events: list[dict[str, Any]]) -> None:
        payload = {
            "sensor_id": str(self._sensor_id),
            "agent_version": config.agent_version,
            "events": events,
        }
        resp = self._client.post("/api/ingest", json=payload)
        resp.raise_for_status()

    def _drain_buffer(self) -> None:
        rows = self._buffer.execute(
            "SELECT id, payload FROM events ORDER BY created_at ASC LIMIT 200"
        ).fetchall()
        if not rows:
            return
        ids = [r[0] for r in rows]
        events = [json.loads(r[1]) for r in rows]
        try:
            self._ship(events)
            self._buffer.execute(
                f"DELETE FROM events WHERE id IN ({','.join('?' * len(ids))})", ids
            )
            self._buffer.commit()
            log.info("reporter.buffer_drained", count=len(events))
        except Exception:
            pass  # leave in buffer for next attempt

    def run(self, stop_event: threading.Event) -> None:
        log.info("reporter.started", server=config.server_url)
        while not stop_event.is_set():
            batch: list[dict[str, Any]] = []
            deadline = time.monotonic() + config.poll_interval_seconds
            while time.monotonic() < deadline and len(batch) < config.batch_size:
                try:
                    event = self._q.get(timeout=1.0)
                    batch.append(event)
                except queue.Empty:
                    continue

            if batch:
                try:
                    self._ship(batch)
                    log.debug("reporter.shipped", count=len(batch))
                except Exception as exc:
                    log.warning("reporter.ship_failed", error=str(exc), buffering=len(batch))
                    for ev in batch:
                        self._buffer.execute(
                            "INSERT INTO events (payload, created_at) VALUES (?, ?)",
                            (json.dumps(ev), time.time()),
                        )
                    self._buffer.commit()

            self._drain_buffer()
