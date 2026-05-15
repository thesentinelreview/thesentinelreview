from __future__ import annotations

import uuid
from typing import Any

import structlog
from anthropic import Anthropic

from ..config import settings
from ..db import create_incident, get_conn, log_llm_call, update_incident_analysis
from ..models import InvestigationResult

log = structlog.get_logger()

_client = Anthropic(api_key=settings.anthropic_api_key)

_INVESTIGATE_TOOL = {
    "name": "investigation_report",
    "description": "Deep forensic incident investigation report",
    "input_schema": {
        "type": "object",
        "required": ["attack_narrative", "mitre_chain", "impact_assessment", "remediation_steps"],
        "properties": {
            "attack_narrative": {
                "type": "string",
                "description": "Full plain-English narrative of the attack: what happened, in chronological order, and why each step matters",
            },
            "mitre_chain": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered list of MITRE ATT&CK technique IDs observed (e.g. ['T1566.001', 'T1059.001', 'T1055'])",
            },
            "impact_assessment": {
                "type": "string",
                "description": "Assessment of what data/systems may be compromised and business impact",
            },
            "remediation_steps": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered list of concrete remediation steps the team should take",
            },
            "estimated_dwell_time": {
                "type": "string",
                "description": "Estimated how long the attacker may have been in the environment",
            },
        },
    },
}

_SYSTEM = """You are a senior incident responder with 15 years of experience
handling nation-state and ransomware incidents. You produce crisp, actionable
investigation reports. Assume the reader is technical but not a security expert.
Focus on the attacker's goal, not just the indicators. Prioritize containment
and eradication in your remediation steps."""


def investigate_incident(alert_id: uuid.UUID, asset_id: uuid.UUID | None) -> InvestigationResult | None:
    with get_conn() as conn:
        alert = conn.execute(
            """
            SELECT a.*, ast.hostname, ast.ip_address::text as ip_str,
                   ast.criticality, ast.os_platform
            FROM security_alerts a
            LEFT JOIN assets ast ON a.asset_id = ast.id
            WHERE a.id = %s
            """,
            (str(alert_id),),
        ).fetchone()
        if not alert:
            return None
        alert = dict(alert)

        # All open/investigating alerts on the same asset (last 24h)
        related: list[dict[str, Any]] = []
        if asset_id:
            rows = conn.execute(
                """
                SELECT title, alert_type, severity, ai_summary, occurred_at
                FROM security_alerts
                WHERE asset_id = %s AND occurred_at >= now() - interval '24 hours'
                ORDER BY occurred_at ASC
                """,
                (str(asset_id),),
            ).fetchall()
            related = [dict(r) for r in rows]

        # Recent telemetry for full context
        telemetry: list[dict[str, Any]] = []
        if asset_id:
            rows = conn.execute(
                """
                SELECT event_type, process_name, process_cmdline, dst_ip::text,
                       dst_port, dns_query, file_path, user_account, event_time
                FROM telemetry_events
                WHERE asset_id = %s ORDER BY event_time DESC LIMIT 30
                """,
                (str(asset_id),),
            ).fetchall()
            telemetry = [dict(r) for r in rows]

    prompt = _build_prompt(alert, related, telemetry)

    response = _client.messages.create(
        model=settings.model_investigation,
        max_tokens=4096,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        tools=[_INVESTIGATE_TOOL],
        tool_choice={"type": "tool", "name": "investigation_report"},
    )

    usage = response.usage
    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        log.error("investigate.no_tool_use", alert_id=str(alert_id))
        return None

    result = InvestigationResult(**tool_use.input)

    analysis_md = _format_analysis(result)

    with get_conn() as conn:
        incident_id = create_incident(
            conn,
            title=f"Incident: {alert['title'][:80]}",
            severity=alert["severity"],
            alert_ids=[alert_id],
        )
        update_incident_analysis(conn, incident_id, analysis_md)
        log_llm_call(
            conn,
            purpose="incident_investigation",
            model=settings.model_investigation,
            prompt_tokens=usage.input_tokens,
            completion_tokens=usage.output_tokens,
            alert_id=alert_id,
            incident_id=incident_id,
        )
        conn.commit()

    log.info("investigate.complete", alert_id=str(alert_id), incident_id=str(incident_id),
             techniques=result.mitre_chain)
    return result


def _build_prompt(
    alert: dict[str, Any],
    related: list[dict[str, Any]],
    telemetry: list[dict[str, Any]],
) -> str:
    lines = [
        "# Incident Investigation Request",
        f"\n## Triggering Alert\n{alert['title']}",
        f"Type: {alert['alert_type']} | Severity: {alert['severity']}",
        f"Asset: {alert.get('hostname') or alert.get('ip_str')} ({alert.get('os_platform')}, "
        f"{alert.get('criticality')} criticality)",
    ]
    if alert.get("ai_summary"):
        lines.append(f"Triage summary: {alert['ai_summary']}")

    if related:
        lines.append(f"\n## Related Alerts on Same Asset ({len(related)} total, last 24h)")
        for r in related:
            lines.append(f"  - [{r['severity'].upper()}] {r['alert_type']}: {r['title']}")

    if telemetry:
        lines.append(f"\n## Telemetry (last {len(telemetry)} events, newest first)")
        for t in telemetry:
            desc = (t.get("process_name") or "") + " " + (t.get("process_cmdline") or t.get("dns_query") or "")
            lines.append(f"  [{t['event_type']}] {desc.strip()[:120]}")

    lines.append("\nProvide a complete investigation report.")
    return "\n".join(lines)


def _format_analysis(result: InvestigationResult) -> str:
    steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(result.remediation_steps))
    techniques = " → ".join(result.mitre_chain) if result.mitre_chain else "Unknown"
    return f"""## Attack Narrative

{result.attack_narrative}

## MITRE ATT&CK Chain

{techniques}

## Impact Assessment

{result.impact_assessment}

## Estimated Dwell Time

{result.estimated_dwell_time or "Unknown — insufficient data"}

## Remediation Steps

{steps}
"""
