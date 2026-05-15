import TopBar from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { getThreatMetrics, getAlerts } from "@/lib/queries";
import type { SecurityAlert } from "@/lib/types";
import Link from "next/link";

export const revalidate = 10;

const ALERT_TYPE_SHORT: Record<string, string> = {
  malware_detected:    "MALWARE",
  ioc_match:           "IOC",
  yara_rule_match:     "YARA",
  c2_beacon:           "C2",
  brute_force:         "BRUTE",
  phishing_url:        "PHISH",
  lateral_movement:    "LATERAL",
  ransomware_behavior: "RANSOM",
  anomaly:             "ANOMALY",
  suspicious_process:  "PROCESS",
  sigma_rule_match:    "SIGMA",
  port_scan:           "SCAN",
  data_exfil:          "EXFIL",
  cve_exploitation:    "CVE",
  zero_day_suspected:  "0-DAY",
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const sp = await searchParams;
  const [metrics, alerts] = await Promise.all([
    getThreatMetrics(),
    getAlerts({ status: sp.status, severity: sp.severity, limit: 100 }),
  ]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      {/* Filter bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          FILTER:
        </span>
        {[undefined, "open", "investigating", "resolved", "false_positive"].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/alerts?status=${s}` : "/alerts"}
            className="font-mono text-[9px] tracking-wider px-2 py-1 border transition-colors"
            style={{
              color: sp.status === s || (!sp.status && !s) ? "var(--color-neon-cyan)" : "var(--color-ink-muted)",
              borderColor: sp.status === s || (!sp.status && !s) ? "var(--color-neon-cyan)40" : "var(--color-edge)",
            }}
          >
            {(s ?? "ALL").toUpperCase()}
          </Link>
        ))}
        <div className="flex-1" />
        <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
          {alerts.length} ALERTS
        </span>
      </div>

      {/* Alert table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr
              className="border-b sticky top-0"
              style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
            >
              {["SEV", "TYPE", "TITLE", "ASSET", "MITRE", "AI SUMMARY", "TIME", "STATUS"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 font-mono text-[8px] tracking-widest"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </tbody>
        </table>
        {alerts.length === 0 && (
          <div className="p-8 text-center font-mono text-sm" style={{ color: "var(--color-ink-faint)" }}>
            NO ALERTS MATCH CURRENT FILTERS
          </div>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: SecurityAlert }) {
  const time = new Date(alert.occurred_at);
  return (
    <tr
      className="border-b hover:brightness-110 transition-colors cursor-pointer"
      style={{
        borderColor: "var(--color-edge)",
        borderLeft: `3px solid ${severityColor(alert.severity)}`,
      }}
    >
      <td className="px-3 py-2">
        <SeverityBadge severity={alert.severity} size="xs" />
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-cyan)" }}>
          {ALERT_TYPE_SHORT[alert.alert_type] ?? alert.alert_type.slice(0, 8).toUpperCase()}
        </span>
      </td>
      <td className="px-3 py-2 max-w-xs">
        <span className="font-mono text-[10px] line-clamp-1" style={{ color: "var(--color-ink)" }}>
          {alert.title}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
          {alert.hostname ?? alert.ip_str ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2">
        {alert.mitre_technique && (
          <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-purple)" }}>
            {alert.mitre_technique}
          </span>
        )}
      </td>
      <td className="px-3 py-2 max-w-xs">
        <span className="font-sans text-[9px] line-clamp-1" style={{ color: "var(--color-ink-muted)" }}>
          {alert.ai_summary ?? "—"}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
          {time.toISOString().slice(0, 16).replace("T", " ")}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className="font-mono text-[8px] px-1.5 py-0.5 tracking-wider"
          style={{
            color: statusColor(alert.status),
            background: `${statusColor(alert.status)}15`,
          }}
        >
          {alert.status.toUpperCase()}
        </span>
      </td>
    </tr>
  );
}

function severityColor(s: string): string {
  switch (s) {
    case "critical": return "var(--color-neon-red)";
    case "high":     return "var(--color-neon-amber)";
    case "medium":   return "var(--color-neon-cyan)";
    default:         return "var(--color-edge-strong)";
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "open":          return "var(--color-neon-red)";
    case "investigating": return "var(--color-neon-amber)";
    case "resolved":      return "var(--color-neon-green)";
    case "false_positive":return "var(--color-ink-muted)";
    default:              return "var(--color-ink-faint)";
  }
}
