"""
Cross-platform telemetry collection using psutil and watchdog.
Runs in a background thread, feeding events into a queue for the reporter.
"""

from __future__ import annotations

import hashlib
import platform
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Any

import psutil
import structlog
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .config import config

log = structlog.get_logger()

_OS = platform.system().lower()  # 'windows', 'darwin', 'linux'


def _sha256_file(path: str, max_bytes: int = 10 * 1024 * 1024) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
                if f.tell() >= max_bytes:
                    break
        return h.hexdigest()
    except OSError:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Collector:
    def __init__(self, event_queue: queue.Queue[dict[str, Any]]) -> None:
        self._q = event_queue
        self._seen_pids: set[int] = set()
        self._observer: Observer | None = None

    def _emit(self, event: dict[str, Any]) -> None:
        event.setdefault("event_time", _now())
        self._q.put(event)

    # ── Process monitoring ─────────────────────────────────────────────────────

    def _collect_processes(self) -> None:
        current_pids: set[int] = set()
        for proc in psutil.process_iter(["pid", "name", "exe", "cmdline", "ppid", "username"]):
            try:
                info = proc.info
                pid = info["pid"]
                current_pids.add(pid)
                if pid not in self._seen_pids:
                    exe = info.get("exe") or ""
                    file_hash = _sha256_file(exe) if exe else None
                    self._emit({
                        "event_type": "process_start",
                        "process_name": info.get("name"),
                        "process_pid": pid,
                        "process_hash": file_hash,
                        "process_cmdline": " ".join(info.get("cmdline") or [])[:500],
                        "parent_process": str(info.get("ppid") or ""),
                        "user_account": info.get("username"),
                        "raw_payload": {"exe": exe},
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # Emit exit events for gone PIDs
        gone = self._seen_pids - current_pids
        for pid in gone:
            self._emit({"event_type": "process_exit", "process_pid": pid})
        self._seen_pids = current_pids

    # ── Network monitoring ─────────────────────────────────────────────────────

    def _collect_connections(self) -> None:
        try:
            conns = psutil.net_connections(kind="inet")
            for conn in conns:
                if conn.status != "ESTABLISHED" or not conn.raddr:
                    continue
                self._emit({
                    "event_type": "network_connect",
                    "src_ip": conn.laddr.ip if conn.laddr else None,
                    "dst_ip": conn.raddr.ip,
                    "dst_port": conn.raddr.port,
                    "protocol": "tcp" if conn.type.name == "SOCK_STREAM" else "udp",
                    "raw_payload": {"status": conn.status, "pid": conn.pid},
                })
        except (psutil.AccessDenied, AttributeError):
            pass

    # ── File system monitoring (watchdog) ──────────────────────────────────────

    def _start_fs_watcher(self) -> None:
        class Handler(FileSystemEventHandler):
            def __init__(self_, collector: Collector) -> None:
                self_._c = collector

            def on_created(self_, event: FileSystemEvent) -> None:
                if event.is_directory:
                    return
                path = str(event.src_path)
                file_hash = _sha256_file(path)
                self_._c._emit({
                    "event_type": "file_create",
                    "file_path": path,
                    "file_hash": file_hash,
                    "raw_payload": {},
                })

            def on_modified(self_, event: FileSystemEvent) -> None:
                if event.is_directory:
                    return
                self_._c._emit({
                    "event_type": "file_modify",
                    "file_path": str(event.src_path),
                    "raw_payload": {},
                })

        import os
        handler = Handler(self)
        self._observer = Observer()
        watch_paths = [
            p for p in config.high_risk_paths
            if os.path.exists(os.path.expanduser(os.path.expandvars(p)))
        ]
        for path in watch_paths:
            expanded = os.path.expanduser(os.path.expandvars(path))
            self._observer.schedule(handler, expanded, recursive=False)
            log.info("collector.watching", path=expanded)

        self._observer.start()

    def run(self, stop_event: threading.Event) -> None:
        log.info("collector.started", os=_OS)
        self._start_fs_watcher()
        while not stop_event.is_set():
            self._collect_processes()
            self._collect_connections()
            time.sleep(config.poll_interval_seconds)

        if self._observer:
            self._observer.stop()
            self._observer.join()
