from __future__ import annotations

import uuid
from typing import Any

import structlog

from ..db import (
    create_alert,
    enqueue,
    get_unprocessed_events,
    mark_events_processed,
    match_iocs_bulk,
)
from .yara_engine import YARAEngine

log = structlog.get_logger()

_yara = YARAEngine()


def _build_ioc_lookups(events: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Build (ioc_type, value) pairs from a batch of events."""
    lookups: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(ioc_type: str, value: str | None) -> None:
        if value and (ioc_type, value) not in seen:
            lookups.append((ioc_type, value))
            seen.add((ioc_type, value))

    for ev in events:
        add("ip", ev.get("dst_ip"))
        add("ip", ev.get("src_ip"))
        add("domain", ev.get("dns_query"))
        add("url", ev.get("http_url"))
        add("hash_sha256", ev.get("process_hash"))
        add("hash_sha256", ev.get("file_hash"))

    return lookups


def _severity_from_confidence(confidence: int, base: str = "medium") -> str:
    if confidence >= 90:
        return "critical"
    if confidence >= 75:
        return "high"
    if confidence >= 50:
        return "medium"
    return base


def run(conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Main correlation job. Three detection passes:
    1. IOC matching (batch SQL lookup)
    2. YARA/behavioral rule matching
    3. Brute-force / auth anomaly detection
    """
    _yara.load_db_rules(conn)
    events = get_unprocessed_events(conn, limit=500)
    if not events:
        return {"processed": 0, "alerts": 0}

    # ── Pass 1: IOC matching ───────────────────────────────────────────────────
    lookups = _build_ioc_lookups(events)
    matched_iocs = match_iocs_bulk(conn, lookups) if lookups else []

    # Index iocs for fast lookup
    ioc_index: dict[tuple[str, str], dict[str, Any]] = {
        (ioc["ioc_type"], ioc["value"]): ioc for ioc in matched_iocs
    }

    alerts_created = 0
    event_ids_processed: list[uuid.UUID] = []

    for event in events:
        event_id = event["id"]
        event_ids_processed.append(event_id)
        asset_id = event.get("asset_id")

        # ── IOC match ──────────────────────────────────────────────────────────
        ioc_hit: dict[str, Any] | None = None
        for field, ioc_type in [
            ("dst_ip", "ip"), ("src_ip", "ip"),
            ("dns_query", "domain"), ("http_url", "url"),
            ("process_hash", "hash_sha256"), ("file_hash", "hash_sha256"),
        ]:
            val = event.get(field)
            if val and (ioc_type, val) in ioc_index:
                ioc_hit = ioc_index[(ioc_type, val)]
                break

        if ioc_hit:
            alert_type = "ioc_match"
            malware_family = ioc_hit.get("malware_family") or ioc_hit.get("threat_type") or "unknown"
            severity = _severity_from_confidence(ioc_hit["confidence"], ioc_hit["severity"])
            alert_id = create_alert(
                conn,
                title=f"IOC Match: {malware_family} — {ioc_hit['ioc_type']} {ioc_hit['value'][:60]}",
                description=f"Telemetry event matched IOC from {ioc_hit.get('raw_data', {}).get('source', 'feed')}",
                alert_type=alert_type,
                severity=severity,
                asset_id=asset_id,
                ioc_id=ioc_hit["id"],
                telemetry_ids=[event_id],
            )
            enqueue(conn, "triage_alert", {"alert_id": str(alert_id)})
            alerts_created += 1
            continue  # one alert per event max

        # ── YARA/behavioral match ──────────────────────────────────────────────
        yara_matches = _yara.match_event(event)
        if yara_matches:
            match = yara_matches[0]  # highest-priority match
            alert_id = create_alert(
                conn,
                title=f"YARA Match: {match.rule_name}" + (
                    f" ({match.threat_family})" if match.threat_family else ""
                ),
                description=f"Process: {event.get('process_name')} | CMD: {(event.get('process_cmdline') or '')[:120]}",
                alert_type="yara_rule_match",
                severity=match.severity,
                asset_id=asset_id,
                rule_id=match.rule_name,
                telemetry_ids=[event_id],
            )
            enqueue(conn, "triage_alert", {"alert_id": str(alert_id)})
            alerts_created += 1
            continue

        # ── Auth anomaly: brute force detection ────────────────────────────────
        if event.get("event_type") == "login_fail" and event.get("src_ip"):
            recent_fails = conn.execute(
                """
                SELECT COUNT(*) as cnt FROM telemetry_events
                WHERE event_type = 'login_fail'
                  AND src_ip = %s::inet
                  AND received_at >= now() - interval '15 minutes'
                """,
                (event["src_ip"],),
            ).fetchone()
            if recent_fails and recent_fails["cnt"] >= 10:
                alert_id = create_alert(
                    conn,
                    title=f"Brute Force: {event['src_ip']} — {recent_fails['cnt']} failures in 15min",
                    alert_type="brute_force",
                    severity="high",
                    asset_id=asset_id,
                    telemetry_ids=[event_id],
                )
                enqueue(conn, "triage_alert", {"alert_id": str(alert_id)})
                alerts_created += 1

    mark_events_processed(conn, event_ids_processed)
    conn.commit()

    log.info("correlator.done", processed=len(events), alerts=alerts_created)
    return {"processed": len(events), "alerts": alerts_created}
