/**
 * Design-system tokens — the single source of truth for the slate dark theme.
 *
 * Primitives import these maps; never inline colour strings per-component. The
 * canonical token table, fonts and primitive specs live in apps/web/DESIGN.md.
 *
 * Palette is standardised on SLATE. Do not introduce new `zinc-*` here.
 */
import type { Confidence, EventType } from "@/lib/types";

// ── Panel chrome ────────────────────────────────────────────────────────────
// Exposed as constants so non-<Panel> surfaces (the styleguide, ad-hoc panels)
// can reference the exact chrome without duplicating it.
export const PANEL_BASE =
  "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl";
export const PANEL_HOVER = "hover:border-slate-600 transition-all";

// ── Shared badge style shape ────────────────────────────────────────────────
export interface BadgeStyle {
  label:     string;
  className: string; // text + bg + border utilities
  dot?:      string; // solid fill for status dots (event-type / confidence)
}

// ── Platform badges ─────────────────────────────────────────────────────────
// Covers every live platform value plus GDELT (present in the ingest feed /
// sensor strip though not in the web `Platform` union). `wire` uses a violet
// placeholder — it is NOT in the Figma export; change it here only.
export const PLATFORM_STYLES: Record<string, BadgeStyle> = {
  rss:      { label: "RSS",      className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  x:        { label: "X",        className: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  telegram: { label: "Telegram", className: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  bluesky:  { label: "Bluesky",  className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  gdelt:    { label: "GDELT",    className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  wire:     { label: "Wire",     className: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
};

// Neutral fallback so an unmapped platform never renders unstyled.
export const PLATFORM_FALLBACK: BadgeStyle = {
  label:     "Source",
  className: "text-slate-400 bg-slate-700/30 border-slate-600/40",
};

export function platformStyle(value: string): BadgeStyle {
  const hit = PLATFORM_STYLES[value?.toLowerCase()];
  if (hit) return hit;
  // Keep the raw value as the label so e.g. a future platform reads as itself.
  return { ...PLATFORM_FALLBACK, label: value || PLATFORM_FALLBACK.label };
}

// ── Tier badges ─────────────────────────────────────────────────────────────
// 1 = emerald · 2 = amber · 3 = slate
export const TIER_STYLES: Record<1 | 2 | 3, BadgeStyle> = {
  1: { label: "Tier 1", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  2: { label: "Tier 2", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  3: { label: "Tier 3", className: "text-slate-400 bg-slate-700/30 border-slate-600/40" },
};

export function tierStyle(value: number): BadgeStyle {
  return TIER_STYLES[value as 1 | 2 | 3] ?? TIER_STYLES[3];
}

// ── Partner badge ───────────────────────────────────────────────────────────
export const PARTNER_BADGE = "bg-red-500/15 border-red-500/30 text-red-400";

// ── Reliability bar ─────────────────────────────────────────────────────────
// ≥80 emerald · ≥60 amber · else red, on a slate-800 track.
export const RELIABILITY = {
  track:      "bg-slate-800",
  thresholds: { high: 80, medium: 60 },
  barColor(score: number): string {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  },
} as const;

// ── Event-type semantics (document-only; not yet consumed by the feed) ───────
// strike = red · clash = amber · movement = cyan
export const EVENT_TYPE_STYLES: Record<EventType, BadgeStyle> = {
  strike:   { label: "Strike",   className: "text-red-400 bg-red-500/10 border-red-500/30",      dot: "bg-red-500" },
  clash:    { label: "Clash",    className: "text-amber-400 bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500" },
  movement: { label: "Movement", className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",    dot: "bg-cyan-500" },
};

// ── Confidence semantics (document-only) ─────────────────────────────────────
// verified = emerald · partial = amber · unconfirmed = slate
export const CONFIDENCE_STYLES: Record<Confidence, BadgeStyle> = {
  verified:    { label: "Verified",    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-500" },
  partial:     { label: "Partial",     className: "text-amber-400 bg-amber-500/10 border-amber-500/30",       dot: "bg-amber-500" },
  unconfirmed: { label: "Unconfirmed", className: "text-slate-400 bg-slate-700/30 border-slate-600/40",       dot: "bg-slate-500" },
};
