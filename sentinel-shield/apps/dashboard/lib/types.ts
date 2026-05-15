export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type AlertStatus = "open" | "investigating" | "resolved" | "false_positive" | "escalated";
export type AlertType =
  | "malware_detected" | "ransomware_behavior" | "ioc_match"
  | "yara_rule_match" | "sigma_rule_match" | "anomaly"
  | "brute_force" | "port_scan" | "phishing_url" | "c2_beacon"
  | "lateral_movement" | "data_exfil" | "cve_exploitation"
  | "zero_day_suspected" | "suspicious_process";

export interface Asset {
  id: string;
  hostname: string | null;
  ip_address: string | null;
  os_platform: "windows" | "darwin" | "linux" | "unknown" | null;
  os_version: string | null;
  department: string | null;
  owner: string | null;
  criticality: "critical" | "high" | "medium" | "low";
  risk_score: number;
  is_active: boolean;
  last_seen: string | null;
  tags: string[];
  created_at: string;
}

export interface SecurityAlert {
  id: string;
  title: string;
  description: string | null;
  alert_type: AlertType;
  severity: Severity;
  status: AlertStatus;
  asset_id: string | null;
  ioc_id: string | null;
  rule_id: string | null;
  mitre_technique: string | null;
  telemetry_ids: string[];
  ai_summary: string | null;
  ai_recommendation: string | null;
  ai_confidence: number | null;
  assigned_to: string | null;
  occurred_at: string;
  created_at: string;
  // Joined fields
  hostname?: string | null;
  ip_str?: string | null;
}

export interface Incident {
  id: string;
  title: string;
  summary: string | null;
  severity: Severity;
  status: string;
  assigned_to: string | null;
  ai_analysis: string | null;
  created_at: string;
  updated_at: string;
  alert_count?: number;
}

export interface IOC {
  id: string;
  ioc_type: string;
  value: string;
  threat_type: string | null;
  malware_family: string | null;
  confidence: number;
  severity: Severity;
  first_seen: string;
  last_seen: string;
  tags: string[];
}

export interface CVE {
  id: string;
  cve_id: string;
  published_at: string;
  cvss_v3_score: number | null;
  severity: string | null;
  description: string;
  has_exploit: boolean;
  kev_listed: boolean;
}

export interface ThreatMetrics {
  open_alerts: number;
  critical_alerts: number;
  active_incidents: number;
  assets_at_risk: number;
  iocs_total: number;
  blocked_total: number;
  alerts_24h: number;
}

export interface GraphNode {
  id: string;
  type: "asset" | "external_ip";
  label: string;
  criticality?: "critical" | "high" | "medium" | "low";
  risk_score?: number;
  alert_count: number;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  bytes_24h: number;
  is_flagged: boolean;
}

export interface MapArc {
  src_lng: number;
  src_lat: number;
  dst_lng: number;
  dst_lat: number;
  severity: Severity;
  alert_id: string;
}

export interface MapAsset {
  id: string;
  lng: number;
  lat: number;
  hostname: string | null;
  risk_score: number;
  alert_count: number;
}
