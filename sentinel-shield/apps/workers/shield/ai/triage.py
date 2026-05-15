from __future__ import annotations

import uuid
from typing import Any

import structlog
from anthropic import Anthropic

from ..config import settings
from ..db import get_conn, log_llm_call, update_alert_triage
from ..models import TriageResult

log = structlog.get_logger()

_client = Anthropic(api_key=settings.anthropic_api_key)

_TRIAGE_TOOL = {
    "name": "triage_alert",
    "description": "Structured triage output for a security alert",
    "input_schema": {
        "type": "object",
        "required": [
            "severity_assessment", "false_positive_likelihood",
            "recommended_action", "summary", "escalate_to_opus",
        ],
        "properties": {
            "severity_assessment": {
                "type": "string",
                "enum": ["critical", "high", "medium", "low", "info"],
                "description": "Assessed severity considering full context",
            },
            "false_positive_likelihood": {
                "type": "integer",
                "minimum": 0, "maximum": 100,
                "description": "Probability this is a false positive (0=definitely real, 100=definitely FP)",
            },
            "mitre_technique": {
                "type": "string",
                "description": "Most likely MITRE ATT&CK technique ID (e.g. T1059.001)",
            },
            "mitre_tactic": {
                "type": "string",
                "description": "MITRE ATT&CK tactic (e.g. execution, persistence, lateral-movement)",
            },
            "recommended_action": {
                "type": "string",
                "description": "Concise recommended remediation or investigation action",
            },
            "summary": {
                "type": "string",
                "description": "2-3 sentence plain-English summary of what happened and why it's suspicious",
            },
            "escalate_to_opus": {
                "type": "boolean",
                "description": "True if this needs deep Opus investigation (critical severity or complex attack chain)",
            },
        },
    },
}

_SYSTEM = """You are a senior threat analyst at a security operations center.
You triage security alerts quickly and accurately. You have deep knowledge of
MITRE ATT&CK, malware families, and attacker TTPs. Be direct and precise.
Consider context: asset criticality, IOC confidence, and behavioral patterns.
Calibrate false positive likelihood carefully — not every PowerShell script is an attack."""


def triage_alert(alert_id: uuid.UUID) -> TriageResult | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT a.*, ast.hostname, ast.ip_address::text as ip_str,
                   ast.criticality, ast.department,
                   i.malware_family, i.threat_type, i.confidence as ioc_confidence,
                   i.raw_data as ioc_raw
            FROM security_alerts a
            LEFT JOIN assets ast ON a.asset_id = ast.id
            LEFT JOIN iocs i ON a.ioc_id = i.id
            WHERE a.id = %s
            """,
            (str(alert_id),),
        ).fetchone()

        if not row:
            log.warning("triage.alert_not_found", alert_id=str(alert_id))
            return None

        alert = dict(row)

        # Gather recent telemetry context (last 5 events from same asset)
        context_events: list[dict[str, Any]] = []
        if alert.get("asset_id"):
            rows = conn.execute(
                """
                SELECT event_type, process_name, process_cmdline, dst_ip, dst_port,
                       dns_query, file_path, user_account, received_at
                FROM telemetry_events
                WHERE asset_id = %s
                ORDER BY received_at DESC LIMIT 5
                """,
                (str(alert["asset_id"]),),
            ).fetchall()
            context_events = [dict(r) for r in rows]

    prompt = _build_prompt(alert, context_events)

    response = _client.messages.create(
        model=settings.model_triage,
        max_tokens=1024,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        tools=[_TRIAGE_TOOL],
        tool_choice={"type": "tool", "name": "triage_alert"},
    )

    usage = response.usage
    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        log.error("triage.no_tool_use", alert_id=str(alert_id))
        return None

    result_data = tool_use.input
    result = TriageResult(**result_data)

    with get_conn() as conn:
        update_alert_triage(conn, alert_id, {
            "summary": result.summary,
            "recommended_action": result.recommended_action,
            "confidence": 100 - result.false_positive_likelihood,
            "false_positive_likelihood": result.false_positive_likelihood,
            "mitre_technique": result.mitre_technique,
            "severity_assessment": result.severity_assessment,
        })
        log_llm_call(
            conn,
            purpose="alert_triage",
            model=settings.model_triage,
            prompt_tokens=usage.input_tokens,
            completion_tokens=usage.output_tokens,
            alert_id=alert_id,
        )
        if result.escalate_to_opus:
            enqueue_investigation(conn, alert_id, alert.get("asset_id"))
        conn.commit()

    log.info("triage.complete", alert_id=str(alert_id), severity=result.severity_assessment,
             fp_likelihood=result.false_positive_likelihood, escalate=result.escalate_to_opus)
    return result


def _build_prompt(alert: dict[str, Any], context_events: list[dict[str, Any]]) -> str:
    lines = [
        f"ALERT TYPE: {alert['alert_type']}",
        f"TITLE: {alert['title']}",
        f"DESCRIPTION: {alert.get('description') or 'N/A'}",
        f"SEVERITY (rule-based): {alert['severity']}",
        f"ASSET: {alert.get('hostname') or alert.get('ip_str') or 'unknown'} "
        f"({alert.get('criticality', 'unknown')} criticality, dept: {alert.get('department') or 'unknown'})",
    ]
    if alert.get("malware_family"):
        lines.append(f"IOC: {alert['malware_family']} / {alert.get('threat_type')} "
                     f"(confidence: {alert.get('ioc_confidence')}%)")
    if context_events:
        lines.append("\nRECENT ASSET ACTIVITY (last 5 events):")
        for ev in context_events:
            lines.append(f"  - [{ev.get('event_type')}] {ev.get('process_name') or ''} "
                         f"{ev.get('process_cmdline') or ev.get('dns_query') or ''}")
    return "\n".join(lines)


def enqueue_investigation(conn: Any, alert_id: uuid.UUID, asset_id: uuid.UUID | None) -> None:
    from ..db import enqueue
    enqueue(conn, "investigate_incident", {
        "alert_id": str(alert_id),
        "asset_id": str(asset_id) if asset_id else None,
    })
