from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

IocType = Literal[
    "ip", "domain", "url", "hash_md5", "hash_sha1", "hash_sha256",
    "email", "cidr", "filename",
]
Severity = Literal["critical", "high", "medium", "low", "info"]
AlertType = Literal[
    "malware_detected", "ransomware_behavior", "ioc_match",
    "yara_rule_match", "sigma_rule_match", "anomaly",
    "brute_force", "port_scan", "phishing_url", "c2_beacon",
    "lateral_movement", "data_exfil", "cve_exploitation",
    "zero_day_suspected", "suspicious_process",
]
AlertStatus = Literal["open", "investigating", "resolved", "false_positive", "escalated"]
JobStatus = Literal["pending", "running", "done", "failed"]
TelemetryEventType = Literal[
    "process_start", "process_exit", "file_create", "file_modify",
    "file_delete", "network_connect", "dns_query", "login",
    "login_fail", "usb_mount", "scan_result", "forensics_capture",
]
OsPlatform = Literal["windows", "darwin", "linux", "unknown"]
Criticality = Literal["critical", "high", "medium", "low"]


# ── Database row models ────────────────────────────────────────────────────────

class Job(BaseModel):
    id: uuid.UUID
    job_type: str
    payload: dict[str, Any]
    status: JobStatus
    attempts: int
    max_attempts: int
    error: str | None
    scheduled_at: datetime
    created_at: datetime


class Asset(BaseModel):
    id: uuid.UUID
    hostname: str | None
    ip_address: str | None
    os_platform: OsPlatform | None
    os_version: str | None
    department: str | None
    owner: str | None
    criticality: Criticality
    risk_score: int
    is_active: bool
    last_seen: datetime | None
    tags: list[str]
    created_at: datetime


class Sensor(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID | None
    name: str
    version: str | None
    last_checkin: datetime | None
    is_active: bool


class IOC(BaseModel):
    id: uuid.UUID
    feed_id: uuid.UUID | None
    ioc_type: IocType
    value: str
    threat_type: str | None
    malware_family: str | None
    confidence: int
    severity: Severity
    first_seen: datetime
    last_seen: datetime
    expires_at: datetime | None
    tags: list[str]
    raw_data: dict[str, Any]


class CVE(BaseModel):
    id: uuid.UUID
    cve_id: str
    published_at: datetime
    cvss_v3_score: float | None
    severity: str | None
    description: str
    has_exploit: bool
    kev_listed: bool


class TelemetryEvent(BaseModel):
    id: uuid.UUID
    sensor_id: uuid.UUID | None
    asset_id: uuid.UUID | None
    event_time: datetime
    event_type: TelemetryEventType
    process_name: str | None
    process_pid: int | None
    process_hash: str | None
    process_cmdline: str | None
    parent_process: str | None
    src_ip: str | None
    dst_ip: str | None
    dst_port: int | None
    protocol: str | None
    dns_query: str | None
    http_url: str | None
    bytes_sent: int | None
    file_path: str | None
    file_hash: str | None
    user_account: str | None
    auth_success: bool | None
    raw_payload: dict[str, Any]
    received_at: datetime


class SecurityAlert(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    alert_type: AlertType
    severity: Severity
    status: AlertStatus
    asset_id: uuid.UUID | None
    ioc_id: uuid.UUID | None
    rule_id: str | None
    mitre_technique: str | None
    telemetry_ids: list[uuid.UUID]
    ai_summary: str | None
    ai_recommendation: str | None
    ai_confidence: int | None
    occurred_at: datetime
    created_at: datetime


class Incident(BaseModel):
    id: uuid.UUID
    title: str
    summary: str | None
    severity: Severity
    status: str
    assigned_to: str | None
    ai_analysis: str | None
    created_at: datetime
    updated_at: datetime


# ── AI pipeline result models ──────────────────────────────────────────────────

class TriageResult(BaseModel):
    severity_assessment: Severity
    false_positive_likelihood: int = Field(ge=0, le=100)
    mitre_technique: str | None
    mitre_tactic: str | None
    recommended_action: str
    summary: str
    escalate_to_opus: bool


class InvestigationResult(BaseModel):
    attack_narrative: str
    mitre_chain: list[str]
    impact_assessment: str
    remediation_steps: list[str]
    estimated_dwell_time: str | None


# ── Ingest payload models ──────────────────────────────────────────────────────

class TelemetryBatch(BaseModel):
    sensor_id: uuid.UUID
    events: list[dict[str, Any]]
    agent_version: str = "0.1.0"


class IOCRecord(BaseModel):
    ioc_type: IocType
    value: str
    threat_type: str | None = None
    malware_family: str | None = None
    confidence: int = 50
    severity: Severity = "medium"
    tags: list[str] = Field(default_factory=list)
    raw_data: dict[str, Any] = Field(default_factory=dict)
