from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import structlog

from ..db import add_to_blocklist, enqueue

log = structlog.get_logger()

_DEFINITIONS_DIR = Path(__file__).parent / "definitions"


def _load_playbooks() -> list[dict[str, Any]]:
    playbooks = []
    for path in _DEFINITIONS_DIR.glob("*.json"):
        try:
            playbooks.append(json.loads(path.read_text()))
        except Exception as exc:
            log.warning("playbook.load_failed", path=str(path), error=str(exc))
    return playbooks


_PLAYBOOKS = _load_playbooks()


def get_matching_playbooks(alert: dict[str, Any]) -> list[dict[str, Any]]:
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    alert_sev = severity_order.get(alert.get("severity", "info"), 4)
    matches = []
    for pb in _PLAYBOOKS:
        if alert.get("alert_type") not in pb.get("trigger_alert_types", []):
            continue
        min_sev = severity_order.get(pb.get("trigger_min_severity", "info"), 4)
        if alert_sev > min_sev:
            continue
        matches.append(pb)
    return matches


def execute_playbook(conn: Any, playbook: dict[str, Any], alert: dict[str, Any]) -> dict[str, Any]:
    alert_id = uuid.UUID(str(alert["id"]))
    actions_taken = []

    for action in playbook.get("actions", []):
        action_type = action["action_type"]
        params = action.get("params", {})

        try:
            if action_type == "block_ip":
                ip = _resolve_field(alert, params.get("field", ""))
                if ip:
                    add_to_blocklist(conn, entry_type="ip", value=ip,
                                     reason=params.get("reason", f"Playbook: {playbook['id']}"),
                                     alert_id=alert_id)
                    actions_taken.append({"type": "block_ip", "value": ip, "status": "ok"})

            elif action_type == "block_hash":
                h = _resolve_field(alert, params.get("field", ""))
                if h:
                    add_to_blocklist(conn, entry_type="hash", value=h,
                                     reason=f"Playbook: {playbook['id']}",
                                     alert_id=alert_id)
                    actions_taken.append({"type": "block_hash", "value": h[:20], "status": "ok"})

            elif action_type == "create_incident":
                enqueue(conn, "investigate_incident", {
                    "alert_id": str(alert_id),
                    "asset_id": str(alert["asset_id"]) if alert.get("asset_id") else None,
                })
                actions_taken.append({"type": "create_incident", "status": "queued"})

            elif action_type == "send_notification":
                enqueue(conn, "send_notification", {
                    "alert_id": str(alert_id),
                    "template": params.get("template", "generic"),
                })
                actions_taken.append({"type": "send_notification", "status": "queued"})

            else:
                log.warning("playbook.unknown_action", action_type=action_type)

        except Exception as exc:
            log.error("playbook.action_failed", action_type=action_type, error=str(exc))
            actions_taken.append({"type": action_type, "status": "failed", "error": str(exc)})

    run_id = conn.execute(
        """
        INSERT INTO playbook_runs (playbook_id, alert_id, status, actions_taken, completed_at)
        VALUES (%s, %s, 'completed', %s, now()) RETURNING id
        """,
        (playbook["id"], str(alert_id), json.dumps(actions_taken)),
    ).fetchone()["id"]

    log.info("playbook.executed", playbook_id=playbook["id"], run_id=str(run_id),
             actions=len(actions_taken))
    return {"run_id": str(run_id), "actions": actions_taken}


def _resolve_field(alert: dict[str, Any], field_path: str) -> str | None:
    """Resolve dot-notation field path against alert dict."""
    parts = field_path.split(".")
    obj: Any = alert
    for part in parts:
        if isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return str(obj) if obj else None
