"use client";

import useSWR from "swr";
import { SeverityDot } from "./SeverityBadge";
import type { SecurityAlert, Severity } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ALERT_TYPE_LABELS: Record<string, string> = {
  malware_detected:   "MALWARE",
  ioc_match:          "IOC MATCH",
  yara_rule_match:    "YARA HIT",
  c2_beacon:          "C2 BEACON",
  brute_force:        "BRUTE FORCE",
  phishing_url:       "PHISHING",
  lateral_movement:   "LATERAL MV",
  ransomware_behavior:"RANSOMWARE",
  anomaly:            "ANOMALY",
  suspicious_process: "SUSP PROC",
};

export default function ThreatTimeline({ maxItems = 30 }: { maxItems?: number }) {
  const { data } = useSWR<{ alerts: SecurityAlert[] }>(
    `/api/alerts?limit=${maxItems}`,
    fetcher,
    { refreshInterval: 15_000 }
  );

  const alerts = data?.alerts ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center px-3 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          THREAT TIMELINE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {/* Vertical connector line */}
        <div
          className="absolute left-[22px] top-0 bottom-0 w-px"
          style={{ background: "var(--color-edge)" }}
        />

        {alerts.map((alert) => (
          <TimelineEntry key={alert.id} alert={alert} />
        ))}

        {alerts.length === 0 && (
          <div className="p-4 font-mono text-xs text-center" style={{ color: "var(--color-ink-faint)" }}>
            SYSTEM NOMINAL
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ alert }: { alert: SecurityAlert }) {
  const time = new Date(alert.occurred_at);
  const label = ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type.toUpperCase();

  return (
    <div className="flex gap-3 px-3 py-2 relative hover:bg-[var(--color-surface-2)] transition-colors">
      <div className="flex flex-col items-center z-10 shrink-0" style={{ paddingTop: 2 }}>
        <SeverityDot severity={alert.severity as Severity} pulse={alert.severity === "critical"} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
            {time.toISOString().slice(11, 19)}
          </span>
          <span
            className="font-mono text-[8px] tracking-wider px-1"
            style={{
              color: severityColor(alert.severity),
              background: `${severityColor(alert.severity)}15`,
            }}
          >
            {label}
          </span>
        </div>
        <div className="font-mono text-[10px] leading-tight truncate mt-0.5"
          style={{ color: "var(--color-ink)" }}>
          {alert.hostname ?? alert.ip_str ?? "—"}
        </div>
        <div className="font-sans text-[9px] truncate" style={{ color: "var(--color-ink-muted)" }}>
          {alert.title}
        </div>
      </div>
    </div>
  );
}

function severityColor(s: string): string {
  switch (s) {
    case "critical": return "var(--color-neon-red)";
    case "high":     return "var(--color-neon-amber)";
    case "medium":   return "var(--color-neon-cyan)";
    default:         return "var(--color-ink-muted)";
  }
}
