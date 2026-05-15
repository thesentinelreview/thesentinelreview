import type { Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<Severity, { color: string; bg: string; label: string }> = {
  critical: { color: "var(--color-neon-red)",    bg: "var(--color-neon-red-dim)",   label: "CRITICAL" },
  high:     { color: "var(--color-neon-amber)",  bg: "var(--color-neon-amber-dim)", label: "HIGH" },
  medium:   { color: "var(--color-neon-cyan)",   bg: "var(--color-neon-cyan-dim)",  label: "MEDIUM" },
  low:      { color: "var(--color-ink-muted)",   bg: "transparent",                 label: "LOW" },
  info:     { color: "var(--color-ink-faint)",   bg: "transparent",                 label: "INFO" },
};

export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "xs" | "sm" }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;
  const textSize = size === "xs" ? "text-[8px]" : "text-[9px]";
  return (
    <span
      className={`font-mono font-semibold tracking-widest px-1.5 py-0.5 ${textSize}`}
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}30` }}
    >
      {s.label}
    </span>
  );
}

export function SeverityDot({ severity, pulse }: { severity: Severity; pulse?: boolean }) {
  const colors: Record<Severity, string> = {
    critical: "var(--color-neon-red)",
    high:     "var(--color-neon-amber)",
    medium:   "var(--color-neon-cyan)",
    low:      "var(--color-ink-muted)",
    info:     "var(--color-ink-faint)",
  };
  const pulseClass: Record<Severity, string> = {
    critical: "animate-pulse-red",
    high:     "animate-pulse-amber",
    medium:   "",
    low:      "",
    info:     "",
  };
  return (
    <div
      className={`w-2 h-2 rounded-full flex-shrink-0 ${pulse ? pulseClass[severity] : ""}`}
      style={{ background: colors[severity] }}
    />
  );
}
