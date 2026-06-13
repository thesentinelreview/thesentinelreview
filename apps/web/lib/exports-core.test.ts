import { describe, expect, it } from "vitest";
import { API_DAILY_LIMITS } from "./api-v1-core";
import {
  CSV_LICENSE_LINE,
  EXPORT_COLUMNS,
  EXPORT_DAILY_LIMITS,
  EXPORT_LIMIT_MESSAGE,
  EXPORT_ROW_CAP,
  buildCsv,
  buildExportFilename,
  buildExportMeta,
  csvTruncationLine,
  exportAllowance,
  resolveExportRange,
  type ExportEventRow,
} from "./exports-core";

const NOW = new Date("2026-06-12T16:30:00.000Z");

describe("window resolution", () => {
  it("named windows compute [now - span, now]", () => {
    for (const [w, hours] of [["24h", 24], ["7d", 168], ["30d", 720], ["90d", 2160]] as const) {
      const r = resolveExportRange(w, null, null, NOW);
      if ("code" in r) throw new Error(r.message);
      expect(r.end).toEqual(NOW);
      expect(NOW.getTime() - r.start.getTime()).toBe(hours * 3_600_000);
      expect(r.window).toBe(w);
      expect(r.slug).toBe(w);
    }
  });

  it("defaults to 24h; rejects unknown windows (no 'all' bulk option)", () => {
    const r = resolveExportRange(null, null, null, NOW);
    if ("code" in r) throw new Error(r.message);
    expect(r.window).toBe("24h");
    expect(resolveExportRange("all", null, null, NOW)).toHaveProperty("code", "invalid_parameter");
    expect(resolveExportRange("1y", null, null, NOW)).toHaveProperty("code", "invalid_parameter");
  });

  it("custom range: happy path carries the ISO interval", () => {
    const r = resolveExportRange(null, "2026-03-01T00:00:00Z", "2026-03-31T23:59:59Z", NOW);
    if ("code" in r) throw new Error(r.message);
    expect(r.window).toBe("2026-03-01T00:00:00.000Z/2026-03-31T23:59:59.000Z");
    expect(r.slug).toBe("custom-2026-03-01-2026-03-31");
  });

  it("custom range: exactly 90 days allowed; anything wider rejected with a clear message", () => {
    const ok = resolveExportRange(null, "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z", NOW);
    expect("code" in ok).toBe(false); // 90 * 24h exactly
    const over = resolveExportRange(null, "2026-01-01T00:00:00Z", "2026-04-01T00:00:01Z", NOW);
    if (!("code" in over)) throw new Error("expected rejection");
    expect(over.message).toContain("90");
    expect(over.message.toLowerCase()).toContain("narrow");
  });

  it("custom range: malformed and inverted inputs rejected", () => {
    expect(resolveExportRange(null, "2026-03-01T00:00:00Z", null, NOW)).toHaveProperty("code");
    expect(resolveExportRange(null, null, "2026-03-01T00:00:00Z", NOW)).toHaveProperty("code");
    expect(resolveExportRange(null, "not-a-date", "2026-03-01T00:00:00Z", NOW)).toHaveProperty("code");
    expect(resolveExportRange(null, "2026-03-02T00:00:00Z", "2026-03-01T00:00:00Z", NOW)).toHaveProperty("code");
  });
});

describe("daily export meter", () => {
  it("analyst: 20th export of the day allowed (0 remaining); 21st rejected", () => {
    expect(exportAllowance(19, "analyst")).toEqual({ allowed: true, limit: 20, remaining: 0 });
    expect(exportAllowance(20, "analyst")).toEqual({ allowed: false, limit: 20, remaining: 0 });
  });

  it("admin: 500/day; bureau inherits the analyst limit; watch has none", () => {
    expect(exportAllowance(499, "admin")).toEqual({ allowed: true, limit: 500, remaining: 0 });
    expect(exportAllowance(500, "admin")).toEqual({ allowed: false, limit: 500, remaining: 0 });
    expect(EXPORT_DAILY_LIMITS.bureau).toBe(EXPORT_DAILY_LIMITS.analyst);
    expect(exportAllowance(0, "watch")).toEqual({ allowed: false, limit: 0, remaining: 0 });
  });

  it("export meter is independent of the API call quota", () => {
    // 21 exports is over the export cap even though the API meter allows
    // 1,000 calls/day — separate ledgers (export_log vs api_usage), separate caps.
    expect(API_DAILY_LIMITS.analyst).toBe(1_000);
    expect(EXPORT_DAILY_LIMITS.analyst).toBe(20);
    expect(exportAllowance(21, "analyst").allowed).toBe(false);
  });

  it("the 429 copy matches the directive verbatim", () => {
    expect(EXPORT_LIMIT_MESSAGE).toBe("Daily export limit reached. Resets 00:00 UTC.");
  });
});

const ROW: ExportEventRow = {
  event_id: "11111111-2222-3333-4444-555555555555",
  occurred_at: "2026-06-12T10:00:00.000Z",
  event_type: "strike",
  theater: "ukraine",
  location_name: 'Kostiantynivka, "new" sector',
  lat: 48.527,
  lon: 37.705,
  source_count: 3,
  confidence: "partial",
  platforms: ["telegram", "x"],
  summary: "Strike reported on industrial area,\nmultiple sources",
  weapon_type: "artillery",
};

describe("CSV file", () => {
  it("license/honesty line is the exact first line; header second; 12 columns", () => {
    const lines = buildCsv([ROW], false).split("\r\n");
    expect(lines[0]).toBe(
      "# Sentinel Intelligence export — confidence-labeled OSINT; not all events verified. " +
        "License: personal and internal-org use only; no redistribution. " +
        "https://dashboard.thesentinelreview.com/terms",
    );
    expect(lines[1]).toBe(EXPORT_COLUMNS.join(","));
    // weapon_type is appended LAST (W2 threat-axis ticket) so the original
    // 11 column positions are unchanged for anyone parsing positionally.
    expect(EXPORT_COLUMNS).toHaveLength(12);
    expect(EXPORT_COLUMNS[10]).toBe("summary");
    expect(EXPORT_COLUMNS[11]).toBe("weapon_type");
  });

  it("weapon_type: classified value as-is; NULL → empty trailing field", () => {
    const classified = buildCsv([ROW], false).split("\r\n");
    expect(classified[2].endsWith(",artillery")).toBe(true);
    const nullRow: ExportEventRow = { ...ROW, summary: "no kinetic class", weapon_type: null };
    const lines = buildCsv([nullRow], false).split("\r\n");
    expect(lines[2].endsWith("no kinetic class,")).toBe(true); // empty 12th field, not "null"
  });

  it("RFC 4180 quoting: commas, quotes, newlines; ISO 8601 UTC timestamp as-is", () => {
    const csv = buildCsv([ROW], false);
    expect(csv).toContain('"Kostiantynivka, ""new"" sector"');
    expect(csv).toContain('"telegram,x"');
    expect(csv).toContain('"Strike reported on industrial area,\nmultiple sources"');
    expect(csv).toContain("2026-06-12T10:00:00.000Z");
  });

  it("truncation comment appears only when truncated", () => {
    expect(buildCsv([ROW], false)).not.toContain("# truncated");
    const truncatedCsv = buildCsv([ROW], true);
    expect(truncatedCsv.split("\r\n")[1]).toBe(csvTruncationLine(1));
    expect(truncatedCsv).toContain(`row cap ${EXPORT_ROW_CAP}`);
  });
});

describe("JSON _meta", () => {
  it("carries exactly the directive's keys", () => {
    const meta = buildExportMeta({
      window: "7d",
      theater: "israel",
      rowCount: 42,
      truncated: false,
      now: NOW,
    });
    expect(Object.keys(meta)).toEqual([
      "product",
      "exported_at",
      "window",
      "theater",
      "row_count",
      "truncated",
      "license_url",
      "confidence_note",
    ]);
    expect(meta.exported_at).toBe("2026-06-12T16:30:00.000Z");
    expect(meta.license_url).toBe("https://dashboard.thesentinelreview.com/terms");
    expect(meta.row_count).toBe(42);
    expect(meta.truncated).toBe(false);
    // the CSV header and the JSON meta carry the same honesty disclosure
    expect(CSV_LICENSE_LINE.toLowerCase()).toContain(meta.confidence_note.toLowerCase());
  });
});

describe("filename", () => {
  it("tie-out-style stamp for named and custom windows", () => {
    expect(buildExportFilename("ukraine", "7d", "csv", NOW)).toBe(
      "sentinel-events-ukraine-7d-2026-06-12T1630Z.csv",
    );
    expect(buildExportFilename("iran", "custom-2026-03-01-2026-03-31", "json", NOW)).toBe(
      "sentinel-events-iran-custom-2026-03-01-2026-03-31-2026-06-12T1630Z.json",
    );
  });
});
