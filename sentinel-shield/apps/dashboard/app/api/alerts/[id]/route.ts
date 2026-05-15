import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const alert = await queryOne<Record<string, unknown>>(
      `SELECT a.*,
              ast.hostname, ast.ip_address::text as ip_str,
              ast.os_platform, ast.os_version, ast.department, ast.owner,
              ast.criticality as asset_criticality, ast.risk_score as asset_risk_score,
              i.ioc_type, i.value as ioc_value, i.threat_type, i.malware_family,
              i.confidence as ioc_confidence, i.severity as ioc_severity,
              c.cve_id, c.cvss_v3_score, c.description as cve_description,
              c.has_exploit, c.kev_listed
       FROM security_alerts a
       LEFT JOIN assets ast ON a.asset_id = ast.id
       LEFT JOIN iocs i ON a.ioc_id = i.id
       LEFT JOIN cves c ON a.cve_id = c.id
       WHERE a.id = $1`,
      [id]
    );

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const [telemetry, playbookRuns] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT id, event_time, event_type, process_name, process_pid, process_cmdline,
                src_ip::text as src_ip, dst_ip::text as dst_ip, dst_port, protocol,
                dns_query, http_url, bytes_sent, file_path, user_account, auth_success
         FROM telemetry_events
         WHERE asset_id = $1
         ORDER BY event_time DESC
         LIMIT 20`,
        [alert.asset_id ?? "00000000-0000-0000-0000-000000000000"]
      ),
      query<Record<string, unknown>>(
        `SELECT id, playbook_id, status, actions_taken, started_at, completed_at
         FROM playbook_runs
         WHERE alert_id = $1
         ORDER BY started_at DESC`,
        [id]
      ),
    ]);

    return NextResponse.json({ alert, telemetry, playbook_runs: playbookRuns });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
