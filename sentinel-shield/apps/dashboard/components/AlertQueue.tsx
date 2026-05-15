"use client";

import useSWR from "swr";
import Link from "next/link";
import { SeverityBadge, SeverityDot } from "./SeverityBadge";
import type { SecurityAlert } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AlertQueue() {
  const { data, error } = useSWR<{ alerts: SecurityAlert[] }>(
    "/api/alerts?status=open&limit=20",
    fetcher,
    { refreshInterval: 10_000 }
  );

  const alerts = data?.alerts ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          ACTIVE ALERTS
        </span>
        <span
          className="font-mono text-[9px] px-1.5 py-0.5 border"
          style={{ color: "var(--color-neon-amber)", borderColor: "var(--color-neon-amber)30" }}
        >
          {alerts.length} OPEN
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-3 font-mono text-xs" style={{ color: "var(--color-neon-red)" }}>
            FEED ERROR — RETRYING
          </div>
        )}
        {alerts.length === 0 && !error && (
          <div className="p-4 font-mono text-xs text-center" style={{ color: "var(--color-ink-faint)" }}>
            NO ACTIVE THREATS
          </div>
        )}
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: SecurityAlert }) {
  const isCritical = alert.severity === "critical";

  return (
    <Link href={`/alerts?focus=${alert.id}`}>
      <div
        className="px-3 py-2.5 border-b cursor-pointer transition-colors hover:brightness-110"
        style={{
          borderColor: "var(--color-edge)",
          borderLeft: `3px solid ${severityColor(alert.severity)}`,
          background: isCritical ? "var(--color-neon-red-dim)" : "transparent",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SeverityDot severity={alert.severity} pulse={isCritical} />
            <span
              className="font-mono text-[10px] font-medium truncate"
              style={{ color: isCritical ? "var(--color-neon-red)" : "var(--color-ink)" }}
            >
              {alert.title}
            </span>
          </div>
          <span className="font-mono text-[8px] shrink-0" style={{ color: "var(--color-ink-muted)" }}>
            {timeAgo(alert.occurred_at)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <SeverityBadge severity={alert.severity} size="xs" />
          <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
            {alert.hostname ?? alert.ip_str ?? "unknown host"}
          </span>
          {alert.mitre_technique && (
            <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-purple)" }}>
              {alert.mitre_technique}
            </span>
          )}
        </div>

        {alert.ai_summary && (
          <p className="mt-1 font-sans text-[9px] leading-tight line-clamp-2"
            style={{ color: "var(--color-ink-muted)" }}>
            {alert.ai_summary}
          </p>
        )}
      </div>
    </Link>
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
