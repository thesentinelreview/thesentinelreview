from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Generator

import structlog
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

log = structlog.get_logger()

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            settings.database_url,
            kwargs={"row_factory": dict_row},
            min_size=2,
            max_size=10,
        )
    return _pool


@contextmanager
def get_conn() -> Generator[Connection, None, None]:
    with get_pool().connection() as conn:
        yield conn


# ── Job queue ──────────────────────────────────────────────────────────────────

def claim_job(conn: Connection) -> dict[str, Any] | None:
    row = conn.execute(
        """
        UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1
        WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'pending' AND scheduled_at <= now()
            ORDER BY scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING *
        """,
    ).fetchone()
    return dict(row) if row else None


def complete_job(conn: Connection, job_id: uuid.UUID) -> None:
    conn.execute(
        "UPDATE jobs SET status = 'done', completed_at = now() WHERE id = %s",
        (str(job_id),),
    )


def fail_job(conn: Connection, job_id: uuid.UUID, error: str) -> None:
    conn.execute(
        """
        UPDATE jobs
        SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
            error = %s,
            scheduled_at = now() + interval '30 seconds' * attempts
        WHERE id = %s
        """,
        (error, str(job_id)),
    )


def enqueue(conn: Connection, job_type: str, payload: dict[str, Any] | None = None) -> uuid.UUID:
    row = conn.execute(
        "INSERT INTO jobs (job_type, payload) VALUES (%s, %s) RETURNING id",
        (job_type, payload or {}),
    ).fetchone()
    return row["id"]


# ── IOCs ───────────────────────────────────────────────────────────────────────

def upsert_ioc(conn: Connection, *, feed_id: uuid.UUID | None = None, **kwargs: Any) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO iocs (feed_id, ioc_type, value, threat_type, malware_family,
                          confidence, severity, tags, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ioc_type, value) DO UPDATE SET
            last_seen = now(),
            threat_type = COALESCE(EXCLUDED.threat_type, iocs.threat_type),
            malware_family = COALESCE(EXCLUDED.malware_family, iocs.malware_family),
            confidence = GREATEST(EXCLUDED.confidence, iocs.confidence),
            severity = EXCLUDED.severity,
            raw_data = iocs.raw_data || EXCLUDED.raw_data
        RETURNING id
        """,
        (
            str(feed_id) if feed_id else None,
            kwargs["ioc_type"],
            kwargs["value"],
            kwargs.get("threat_type"),
            kwargs.get("malware_family"),
            kwargs.get("confidence", 50),
            kwargs.get("severity", "medium"),
            kwargs.get("tags", []),
            kwargs.get("raw_data", {}),
        ),
    ).fetchone()
    return row["id"]


def bulk_upsert_iocs(conn: Connection, iocs: list[dict[str, Any]]) -> int:
    count = 0
    for ioc in iocs:
        upsert_ioc(conn, **ioc)
        count += 1
    return count


def lookup_ioc(conn: Connection, ioc_type: str, value: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM iocs WHERE ioc_type = %s AND value = %s AND (expires_at IS NULL OR expires_at > now())",
        (ioc_type, value),
    ).fetchone()
    return dict(row) if row else None


def match_iocs_bulk(conn: Connection, lookups: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Match multiple (ioc_type, value) pairs in one query."""
    if not lookups:
        return []
    placeholders = ",".join(["(%s,%s)"] * len(lookups))
    params = [x for pair in lookups for x in pair]
    rows = conn.execute(
        f"SELECT * FROM iocs WHERE (ioc_type, value) IN ({placeholders}) "
        "AND (expires_at IS NULL OR expires_at > now())",
        params,
    ).fetchall()
    return [dict(r) for r in rows]


# ── CVEs ───────────────────────────────────────────────────────────────────────

def upsert_cve(conn: Connection, **kwargs: Any) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO cves (cve_id, published_at, modified_at, cvss_v3_score, cvss_v3_vector,
                          severity, description, affected_products, references, has_exploit, kev_listed)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (cve_id) DO UPDATE SET
            modified_at = EXCLUDED.modified_at,
            cvss_v3_score = EXCLUDED.cvss_v3_score,
            severity = EXCLUDED.severity,
            description = EXCLUDED.description,
            has_exploit = EXCLUDED.has_exploit,
            kev_listed = EXCLUDED.kev_listed
        RETURNING id
        """,
        (
            kwargs["cve_id"],
            kwargs["published_at"],
            kwargs.get("modified_at", kwargs["published_at"]),
            kwargs.get("cvss_v3_score"),
            kwargs.get("cvss_v3_vector"),
            kwargs.get("severity"),
            kwargs.get("description", ""),
            kwargs.get("affected_products", []),
            kwargs.get("references", []),
            kwargs.get("has_exploit", False),
            kwargs.get("kev_listed", False),
        ),
    ).fetchone()
    return row["id"]


# ── Attack techniques ──────────────────────────────────────────────────────────

def upsert_attack_technique(conn: Connection, **kwargs: Any) -> None:
    conn.execute(
        """
        INSERT INTO attack_techniques (technique_id, name, tactic, description,
                                       platforms, is_subtechnique, parent_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (technique_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            platforms = EXCLUDED.platforms
        """,
        (
            kwargs["technique_id"],
            kwargs["name"],
            kwargs["tactic"],
            kwargs.get("description"),
            kwargs.get("platforms", []),
            kwargs.get("is_subtechnique", False),
            kwargs.get("parent_id"),
        ),
    )


# ── Assets ─────────────────────────────────────────────────────────────────────

def upsert_asset(conn: Connection, **kwargs: Any) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO assets (hostname, ip_address, os_platform, os_version, department, owner, tags)
        VALUES (%s, %s::inet, %s, %s, %s, %s, %s)
        ON CONFLICT (ip_address) DO UPDATE SET
            hostname = COALESCE(EXCLUDED.hostname, assets.hostname),
            os_platform = COALESCE(EXCLUDED.os_platform, assets.os_platform),
            os_version = COALESCE(EXCLUDED.os_version, assets.os_version),
            last_seen = now(),
            is_active = true
        RETURNING id
        """,
        (
            kwargs.get("hostname"),
            kwargs.get("ip_address"),
            kwargs.get("os_platform", "unknown"),
            kwargs.get("os_version"),
            kwargs.get("department"),
            kwargs.get("owner"),
            kwargs.get("tags", []),
        ),
    ).fetchone()
    return row["id"]


def get_asset_by_ip(conn: Connection, ip: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM assets WHERE ip_address = %s::inet", (ip,)
    ).fetchone()
    return dict(row) if row else None


def update_asset_risk_score(conn: Connection, asset_id: uuid.UUID, score: int) -> None:
    conn.execute(
        "UPDATE assets SET risk_score = %s WHERE id = %s",
        (min(100, max(0, score)), str(asset_id)),
    )


# ── Telemetry ──────────────────────────────────────────────────────────────────

def insert_telemetry_event(conn: Connection, **kwargs: Any) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO telemetry_events (
            sensor_id, asset_id, event_time, event_type,
            process_name, process_pid, process_hash, process_cmdline, parent_process,
            src_ip, dst_ip, dst_port, protocol, dns_query, http_url, bytes_sent,
            file_path, file_hash, user_account, auth_success, raw_payload
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s::inet, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s
        ) RETURNING id
        """,
        (
            str(kwargs["sensor_id"]) if kwargs.get("sensor_id") else None,
            str(kwargs["asset_id"]) if kwargs.get("asset_id") else None,
            kwargs.get("event_time"),
            kwargs["event_type"],
            kwargs.get("process_name"),
            kwargs.get("process_pid"),
            kwargs.get("process_hash"),
            kwargs.get("process_cmdline"),
            kwargs.get("parent_process"),
            kwargs.get("src_ip"),
            kwargs.get("dst_ip"),
            kwargs.get("dst_port"),
            kwargs.get("protocol"),
            kwargs.get("dns_query"),
            kwargs.get("http_url"),
            kwargs.get("bytes_sent"),
            kwargs.get("file_path"),
            kwargs.get("file_hash"),
            kwargs.get("user_account"),
            kwargs.get("auth_success"),
            kwargs.get("raw_payload", {}),
        ),
    ).fetchone()
    return row["id"]


def get_unprocessed_events(conn: Connection, limit: int = 500) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM telemetry_events WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT %s",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def mark_events_processed(conn: Connection, event_ids: list[uuid.UUID]) -> None:
    conn.execute(
        "UPDATE telemetry_events SET processed_at = now() WHERE id = ANY(%s)",
        ([str(i) for i in event_ids],),
    )


# ── Alerts ─────────────────────────────────────────────────────────────────────

def create_alert(conn: Connection, **kwargs: Any) -> uuid.UUID:
    row = conn.execute(
        """
        INSERT INTO security_alerts (
            title, description, alert_type, severity,
            asset_id, ioc_id, rule_id, mitre_technique, telemetry_ids
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            kwargs["title"],
            kwargs.get("description"),
            kwargs["alert_type"],
            kwargs.get("severity", "medium"),
            str(kwargs["asset_id"]) if kwargs.get("asset_id") else None,
            str(kwargs["ioc_id"]) if kwargs.get("ioc_id") else None,
            kwargs.get("rule_id"),
            kwargs.get("mitre_technique"),
            [str(i) for i in kwargs.get("telemetry_ids", [])],
        ),
    ).fetchone()
    return row["id"]


def update_alert_triage(conn: Connection, alert_id: uuid.UUID, triage: dict[str, Any]) -> None:
    conn.execute(
        """
        UPDATE security_alerts SET
            ai_summary = %s,
            ai_recommendation = %s,
            ai_confidence = %s,
            ai_false_positive_likelihood = %s,
            mitre_technique = COALESCE(%s, mitre_technique),
            severity = %s
        WHERE id = %s
        """,
        (
            triage.get("summary"),
            triage.get("recommended_action"),
            triage.get("confidence"),
            triage.get("false_positive_likelihood"),
            triage.get("mitre_technique"),
            triage.get("severity_assessment", "medium"),
            str(alert_id),
        ),
    )


def get_open_alerts(conn: Connection, limit: int = 50) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT a.*, ast.hostname, ast.ip_address::text as ip_str
        FROM security_alerts a
        LEFT JOIN assets ast ON a.asset_id = ast.id
        WHERE a.status IN ('open','investigating')
        ORDER BY
            CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                            WHEN 'medium' THEN 2 ELSE 3 END,
            a.occurred_at DESC
        LIMIT %s
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


# ── Incidents ──────────────────────────────────────────────────────────────────

def create_incident(conn: Connection, title: str, severity: str, alert_ids: list[uuid.UUID]) -> uuid.UUID:
    row = conn.execute(
        "INSERT INTO incidents (title, severity) VALUES (%s, %s) RETURNING id",
        (title, severity),
    ).fetchone()
    incident_id = row["id"]
    for alert_id in alert_ids:
        conn.execute(
            "INSERT INTO incident_alerts (incident_id, alert_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (str(incident_id), str(alert_id)),
        )
    return incident_id


def update_incident_analysis(conn: Connection, incident_id: uuid.UUID, analysis: str) -> None:
    conn.execute(
        "UPDATE incidents SET ai_analysis = %s, updated_at = now() WHERE id = %s",
        (analysis, str(incident_id)),
    )


# ── LLM logging ────────────────────────────────────────────────────────────────

def log_llm_call(
    conn: Connection,
    *,
    purpose: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    alert_id: uuid.UUID | None = None,
    incident_id: uuid.UUID | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO llm_logs (purpose, model, prompt_tokens, completion_tokens, alert_id, incident_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            purpose,
            model,
            prompt_tokens,
            completion_tokens,
            str(alert_id) if alert_id else None,
            str(incident_id) if incident_id else None,
        ),
    )


# ── Blocklist ──────────────────────────────────────────────────────────────────

def add_to_blocklist(
    conn: Connection,
    *,
    entry_type: str,
    value: str,
    reason: str,
    alert_id: uuid.UUID | None = None,
    added_by: str = "system",
) -> None:
    conn.execute(
        """
        INSERT INTO blocklist (entry_type, value, reason, alert_id, added_by)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (entry_type, value) DO UPDATE SET
            reason = EXCLUDED.reason,
            is_active = true,
            added_by = EXCLUDED.added_by
        """,
        (entry_type, value, reason, str(alert_id) if alert_id else None, added_by),
    )


def get_active_blocklist(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM blocklist WHERE is_active = true ORDER BY created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]
