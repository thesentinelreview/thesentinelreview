import { query, queryOne } from "./db";
import type { SecurityAlert, Asset, Incident, IOC, CVE, ThreatMetrics } from "./types";

export async function getOpenAlerts(limit = 50): Promise<SecurityAlert[]> {
  return query<SecurityAlert>(
    `SELECT a.*, ast.hostname, ast.ip_address::text as ip_str
     FROM security_alerts a
     LEFT JOIN assets ast ON a.asset_id = ast.id
     WHERE a.status IN ('open','investigating')
     ORDER BY
       CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       a.occurred_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getAlert(id: string): Promise<SecurityAlert | null> {
  return queryOne<SecurityAlert>(
    `SELECT a.*, ast.hostname, ast.ip_address::text as ip_str,
            ast.criticality as asset_criticality, ast.os_platform
     FROM security_alerts a
     LEFT JOIN assets ast ON a.asset_id = ast.id
     WHERE a.id = $1`,
    [id]
  );
}

export async function getAlerts(params: {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<SecurityAlert[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.status) {
    conditions.push(`a.status = $${i++}`);
    values.push(params.status);
  }
  if (params.severity) {
    conditions.push(`a.severity = $${i++}`);
    values.push(params.severity);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(params.limit ?? 50);
  values.push(params.offset ?? 0);

  return query<SecurityAlert>(
    `SELECT a.*, ast.hostname, ast.ip_address::text as ip_str
     FROM security_alerts a
     LEFT JOIN assets ast ON a.asset_id = ast.id
     ${where}
     ORDER BY
       CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       a.occurred_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    values
  );
}

export async function getThreatMetrics(): Promise<ThreatMetrics> {
  const [alerts, incidents, assets, iocs, blocked, h24] = await Promise.all([
    queryOne<{ open: string; critical: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open','investigating')) as open,
         COUNT(*) FILTER (WHERE status IN ('open','investigating') AND severity = 'critical') as critical
       FROM security_alerts`
    ),
    queryOne<{ active: string }>(
      `SELECT COUNT(*) FILTER (WHERE status IN ('open','investigating')) as active FROM incidents`
    ),
    queryOne<{ at_risk: string }>(
      `SELECT COUNT(*) FILTER (WHERE risk_score > 50) as at_risk FROM assets WHERE is_active = true`
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM iocs WHERE (expires_at IS NULL OR expires_at > now())`
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM blocklist WHERE is_active = true`
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM security_alerts WHERE occurred_at >= now() - interval '24 hours'`
    ),
  ]);

  return {
    open_alerts: parseInt(alerts?.open ?? "0"),
    critical_alerts: parseInt(alerts?.critical ?? "0"),
    active_incidents: parseInt(incidents?.active ?? "0"),
    assets_at_risk: parseInt(assets?.at_risk ?? "0"),
    iocs_total: parseInt(iocs?.total ?? "0"),
    blocked_total: parseInt(blocked?.total ?? "0"),
    alerts_24h: parseInt(h24?.count ?? "0"),
  };
}

export async function getAssets(limit = 100): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets WHERE is_active = true ORDER BY risk_score DESC LIMIT $1`,
    [limit]
  );
}

export async function getAsset(id: string): Promise<Asset | null> {
  return queryOne<Asset>(`SELECT * FROM assets WHERE id = $1`, [id]);
}

export async function getIncidents(limit = 20): Promise<Incident[]> {
  return query<Incident>(
    `SELECT i.*, COUNT(ia.alert_id) as alert_count
     FROM incidents i
     LEFT JOIN incident_alerts ia ON i.id = ia.incident_id
     GROUP BY i.id
     ORDER BY
       CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       i.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getIncident(id: string): Promise<Incident | null> {
  return queryOne<Incident>(`SELECT * FROM incidents WHERE id = $1`, [id]);
}

export async function getIncidentAlerts(incidentId: string): Promise<SecurityAlert[]> {
  return query<SecurityAlert>(
    `SELECT a.*, ast.hostname, ast.ip_address::text as ip_str
     FROM security_alerts a
     JOIN incident_alerts ia ON a.id = ia.alert_id
     LEFT JOIN assets ast ON a.asset_id = ast.id
     WHERE ia.incident_id = $1
     ORDER BY a.occurred_at ASC`,
    [incidentId]
  );
}

export async function searchIOCs(q: string, limit = 50): Promise<IOC[]> {
  return query<IOC>(
    `SELECT * FROM iocs
     WHERE value ILIKE $1
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY last_seen DESC LIMIT $2`,
    [`%${q}%`, limit]
  );
}

export async function getRecentCVEs(limit = 50): Promise<CVE[]> {
  return query<CVE>(
    `SELECT * FROM cves ORDER BY published_at DESC LIMIT $1`,
    [limit]
  );
}

export async function updateAlertStatus(
  id: string,
  status: string,
  assignedTo?: string
): Promise<void> {
  await query(
    `UPDATE security_alerts SET status = $1, assigned_to = COALESCE($2, assigned_to),
     resolved_at = CASE WHEN $1 IN ('resolved','false_positive') THEN now() ELSE resolved_at END
     WHERE id = $3`,
    [status, assignedTo ?? null, id]
  );
}
