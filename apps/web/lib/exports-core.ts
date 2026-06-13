// Customer exports (W2-2) — pure logic (no I/O). Server wiring lives in
// app/api/export/events/route.ts. Session-authenticated dashboard exports are
// a separate lane from the bearer-key Read API: they meter against export_log,
// never api_usage, so a UI export cannot decrement the API call quota.
import type { Tier } from "./entitlements-core";
import type { ParamError } from "./api-v1-core";

/** Per-UTC-day export caps. Bureau is not sellable yet — a bureau grant
 * inherits the analyst limit until Bureau ships with its own. Watch has no
 * entry: no exports at any count. */
export const EXPORT_DAILY_LIMITS: Partial<Record<Tier, number>> = {
  analyst: 20,
  bureau: 20,
  admin: 500,
};

/** Hard per-file row cap; files at the cap are flagged truncated. */
export const EXPORT_ROW_CAP = 10_000;

/** Maximum custom-range span. There is deliberately no "all" window — the
 * archive stays queryable in-dashboard and via the paginated API, but a
 * one-click full-archive dump is not offered (the ToS "no bulk" line). */
export const EXPORT_MAX_SPAN_DAYS = 90;

export const EXPORT_WINDOWS = ["24h", "7d", "30d", "90d"] as const;
export type ExportWindow = (typeof EXPORT_WINDOWS)[number];

const WINDOW_HOURS: Record<ExportWindow, number> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
  "90d": 90 * 24,
};

export const EXPORT_LICENSE_URL = "https://dashboard.thesentinelreview.com/terms";

export const EXPORT_CONFIDENCE_NOTE =
  "Confidence-labeled OSINT; not all events verified.";

/** The exact first line of every CSV export — license + honesty disclosure. */
export const CSV_LICENSE_LINE =
  "# Sentinel Intelligence export — confidence-labeled OSINT; not all events verified. " +
  "License: personal and internal-org use only; no redistribution. " +
  EXPORT_LICENSE_URL;

/** The exact 429 message — the UI renders this string verbatim. */
export const EXPORT_LIMIT_MESSAGE = "Daily export limit reached. Resets 00:00 UTC.";

// ---- window resolution ------------------------------------------------------

export interface ExportRange {
  start: Date;
  end: Date;
  /** Named token ("24h"…"90d") or, for custom ranges, the ISO 8601 interval
   * "start/end" — this is what _meta.window and export_log carry. */
  window: string;
  /** Filename-safe window token. */
  slug: string;
}

function paramError(message: string): ParamError {
  return { code: "invalid_parameter", message };
}

/**
 * Resolve the export window from query params. Either a named window
 * (window=24h|7d|30d|90d, default 24h) or a custom range (start+end, both
 * ISO 8601, span ≤ EXPORT_MAX_SPAN_DAYS). Anything wider is rejected here —
 * there is no bulk-dump path.
 */
export function resolveExportRange(
  windowRaw: string | null,
  startRaw: string | null,
  endRaw: string | null,
  now: Date = new Date(),
): ExportRange | ParamError {
  if (startRaw !== null || endRaw !== null) {
    if (!startRaw || !endRaw) {
      return paramError("Custom ranges need both start and end (ISO 8601 timestamps).");
    }
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime())) return paramError("start must be an ISO 8601 timestamp");
    if (Number.isNaN(end.getTime())) return paramError("end must be an ISO 8601 timestamp");
    if (start.getTime() >= end.getTime()) return paramError("start must be before end");
    const spanMs = end.getTime() - start.getTime();
    if (spanMs > EXPORT_MAX_SPAN_DAYS * 24 * 3_600_000) {
      return paramError(
        `Range spans more than ${EXPORT_MAX_SPAN_DAYS} days. Exports are capped at a ` +
          `${EXPORT_MAX_SPAN_DAYS}-day span — narrow the range and export in slices.`,
      );
    }
    const slug = `custom-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}`;
    return { start, end, window: `${start.toISOString()}/${end.toISOString()}`, slug };
  }

  const window = (windowRaw ?? "24h") as ExportWindow;
  if (!EXPORT_WINDOWS.includes(window)) {
    return paramError(`window must be one of ${EXPORT_WINDOWS.join(", ")}`);
  }
  const end = now;
  const start = new Date(end.getTime() - WINDOW_HOURS[window] * 3_600_000);
  return { start, end, window, slug: window };
}

// ---- daily meter ------------------------------------------------------------

/**
 * Check-then-log metering over export_log: countToday is the user's rows for
 * the current UTC day BEFORE this export. Counts 0..limit-1 may proceed; the
 * limit-th request of the day is the last allowed, limit+1 → 429. The counter
 * resets implicitly at 00:00 UTC because the count is scoped to the UTC day.
 */
export function exportAllowance(
  countToday: number,
  tier: Tier,
): { allowed: boolean; limit: number; remaining: number } {
  const limit = EXPORT_DAILY_LIMITS[tier] ?? 0;
  if (limit <= 0) return { allowed: false, limit: 0, remaining: 0 };
  const allowed = countToday < limit;
  // remaining = exports left AFTER this one proceeds (0 on the last allowed).
  return { allowed, limit, remaining: allowed ? limit - countToday - 1 : 0 };
}

// ---- file building ----------------------------------------------------------

export const EXPORT_COLUMNS = [
  "event_id",
  "occurred_at",
  "event_type",
  "theater",
  "location_name",
  "lat",
  "lon",
  "source_count",
  "confidence",
  "platforms",
  "summary",
  "weapon_type",
] as const;

/** One export row. The 10 tie-out columns plus summary — the event text shown
 * on event cards and the event page (schema column: events.description; the
 * Read API exposes the same value as `summary`) — plus weapon_type, the coarse
 * kinetic-capability class (appended last so the original column positions are
 * unchanged; null/empty when no kinetic capability is identifiable). */
export interface ExportEventRow {
  event_id: string;
  occurred_at: string; // ISO 8601 UTC
  event_type: string;
  theater: string;
  location_name: string | null;
  lat: number;
  lon: number;
  source_count: number;
  confidence: string; // verified | partial | unconfirmed — exported as-is
  platforms: string[];
  summary: string;
  weapon_type: string | null; // CSV renders null as the empty string
}

// RFC 4180: quote a field if it contains a quote, comma, CR or LF; escape " as "".
// Same rule as the admin tie-out export (app/admin/tieout/export/route.ts).
function csvField(v: string | number): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvTruncationLine(rowCount: number): string {
  return `# truncated: true — row cap ${EXPORT_ROW_CAP} reached; this file holds the newest ${rowCount} rows. Narrow the window to retrieve the rest.`;
}

/** Build the CSV file: license line, optional truncation comment, header, rows. */
export function buildCsv(rows: ExportEventRow[], truncated: boolean): string {
  const EOL = "\r\n";
  const lines: string[] = [CSV_LICENSE_LINE];
  if (truncated) lines.push(csvTruncationLine(rows.length));
  lines.push(EXPORT_COLUMNS.map(csvField).join(","));
  for (const r of rows) {
    lines.push(
      [
        r.event_id,
        r.occurred_at,
        r.event_type,
        r.theater,
        r.location_name ?? "",
        r.lat,
        r.lon,
        r.source_count,
        r.confidence,
        r.platforms.join(","),
        r.summary,
        r.weapon_type ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join(EOL) + EOL;
}

export interface ExportMeta {
  product: string;
  exported_at: string;
  window: string;
  theater: string;
  row_count: number;
  truncated: boolean;
  license_url: string;
  confidence_note: string;
}

export function buildExportMeta(o: {
  window: string;
  theater: string;
  rowCount: number;
  truncated: boolean;
  now?: Date;
}): ExportMeta {
  return {
    product: "Sentinel Intelligence export",
    exported_at: (o.now ?? new Date()).toISOString(),
    window: o.window,
    theater: o.theater,
    row_count: o.rowCount,
    truncated: o.truncated,
    license_url: EXPORT_LICENSE_URL,
    confidence_note: EXPORT_CONFIDENCE_NOTE,
  };
}

/** sentinel-events-<theater>-<window>-<YYYY-MM-DDTHHMMZ>.<ext> (tie-out naming). */
export function buildExportFilename(
  theater: string,
  slug: string,
  format: "csv" | "json",
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().slice(0, 16).replace(/:/g, "") + "Z";
  return `sentinel-events-${theater}-${slug}-${stamp}.${format}`;
}
