"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/toc",          label: "TOC" },
  { href: "/alerts",       label: "ALERTS" },
  { href: "/incidents",    label: "INCIDENTS" },
  { href: "/assets",       label: "ASSETS" },
  { href: "/intelligence", label: "INTEL" },
  { href: "/rules",        label: "RULES" },
];

export default function TopBar({ metrics }: {
  metrics?: { open_alerts: number; critical_alerts: number; active_incidents: number };
}) {
  const pathname = usePathname();

  return (
    <header
      className="flex items-center justify-between px-4 h-12 border-b shrink-0"
      style={{
        borderColor: "var(--color-edge)",
        background: "linear-gradient(180deg, var(--color-surface-2) 0%, var(--color-surface) 100%)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full animate-pulse-green"
          style={{ background: "var(--color-neon-green)" }}
        />
        <span
          className="font-mono text-xs tracking-[0.3em] font-semibold glow-green"
          style={{ color: "var(--color-neon-green)" }}
        >
          SENTINEL SHIELD
        </span>
        <span
          className="font-mono text-[9px] tracking-[0.25em] px-1.5 py-0.5 border"
          style={{ color: "var(--color-ink-muted)", borderColor: "var(--color-edge-strong)" }}
        >
          CLASSIFIED
        </span>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1">
        {NAV.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 font-mono text-[10px] tracking-[0.15em] transition-colors rounded-sm"
              style={{
                color: active ? "var(--color-neon-cyan)" : "var(--color-ink-muted)",
                background: active ? "var(--color-neon-cyan-dim)" : "transparent",
                borderBottom: active ? "1px solid var(--color-neon-cyan)" : "1px solid transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Live metrics */}
      <div className="flex items-center gap-4">
        {metrics && (
          <>
            <MetricChip
              label="CRITICAL"
              value={metrics.critical_alerts}
              color="var(--color-neon-red)"
              pulse={metrics.critical_alerts > 0}
            />
            <MetricChip
              label="OPEN"
              value={metrics.open_alerts}
              color="var(--color-neon-amber)"
            />
            <MetricChip
              label="INCIDENTS"
              value={metrics.active_incidents}
              color="var(--color-neon-cyan)"
            />
          </>
        )}
        <div className="font-mono text-[9px] tracking-wider" style={{ color: "var(--color-ink-faint)" }}>
          {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
        </div>
      </div>
    </header>
  );
}

function MetricChip({ label, value, color, pulse }: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-1.5 h-1.5 rounded-full ${pulse ? "animate-pulse-red" : ""}`}
        style={{ background: color }}
      />
      <span className="font-mono text-[9px] tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      <span className="font-mono text-xs font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
