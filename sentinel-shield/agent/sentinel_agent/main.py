"""
Sentinel Shield endpoint agent.
Runs as a system service on Windows/macOS/Linux.
"""

from __future__ import annotations

import platform
import queue
import signal
import sys
import threading
import uuid
from pathlib import Path

import structlog

from .collector import Collector
from .config import config
from .reporter import Reporter

log = structlog.get_logger()

_SENSOR_ID_PATH = Path("~/.sentinel-agent/sensor_id").expanduser()


def _get_or_create_sensor_id() -> uuid.UUID:
    _SENSOR_ID_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _SENSOR_ID_PATH.exists():
        return uuid.UUID(_SENSOR_ID_PATH.read_text().strip())
    sensor_id = uuid.uuid4()
    _SENSOR_ID_PATH.write_text(str(sensor_id))
    return sensor_id


def main() -> None:
    sensor_id = _get_or_create_sensor_id()
    log.info("agent.starting", sensor_id=str(sensor_id), os=platform.system(),
             version=config.agent_version, server=config.server_url)

    event_queue: queue.Queue = queue.Queue(maxsize=10_000)
    stop_event = threading.Event()

    collector = Collector(event_queue)
    reporter = Reporter(event_queue, sensor_id)

    collector_thread = threading.Thread(
        target=collector.run, args=(stop_event,), name="collector", daemon=True
    )
    reporter_thread = threading.Thread(
        target=reporter.run, args=(stop_event,), name="reporter", daemon=True
    )

    def _shutdown(sig: int, _: object) -> None:
        log.info("agent.stopping")
        stop_event.set()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    collector_thread.start()
    reporter_thread.start()

    stop_event.wait()
    collector_thread.join(timeout=5)
    reporter_thread.join(timeout=10)
    log.info("agent.stopped")


if __name__ == "__main__":
    main()
