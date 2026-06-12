import ExcelJS from "exceljs";
import { isAdmin } from "@/lib/auth";
import { resolveTieoutTheater } from "@/data/theaters";
import {
  getFusionCounts,
  getTieoutRows,
  resolveTieoutWindow,
  tieoutSummary,
  type TieoutRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLUMNS = [
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
] as const;

// RFC 4180: quote a field if it contains a quote, comma, CR or LF; escape " as "".
function csvField(v: string | number): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowValues(r: TieoutRow): (string | number)[] {
  return [
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
  ];
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const theater = resolveTieoutTheater(url.searchParams.get("theater") ?? undefined);
  const window = resolveTieoutWindow(url.searchParams.get("window") ?? undefined);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const [rows, fusionCounts] = await Promise.all([
    getTieoutRows(theater.id, window),
    getFusionCounts(theater.id, window),
  ]);

  const a = fusionCounts ?? { total: 0, multiSource: 0 };
  const b = tieoutSummary(rows);
  const methodA = a.total === 0 ? "" : Math.round((a.multiSource / a.total) * 100);
  const methodB = b.fusionPct ?? "";

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.slice(0, 16).replace(/:/g, "") + "Z"; // YYYY-MM-DDTHHMMZ
  const base = `sentinel-tieout-${theater.id}-${window}-${stamp}`;

  // Self-documenting summary block so the file is audit-defensible on its own.
  const summary: [string, string | number][] = [
    ["theater", theater.id],
    ["theater_label", theater.label],
    ["window", window],
    ["generated_at", generatedAt],
    ["total_events", b.total],
    ["multi_source_events", b.multiSource],
    ["fusion_method_a_pct", methodA],
    ["fusion_method_b_pct", methodB],
    ["fusion_method_a_total", a.total],
    ["fusion_method_a_multi", a.multiSource],
  ];

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sentinel Review";
    wb.created = new Date(generatedAt);

    const summarySheet = wb.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Key", key: "k" },
      { header: "Value", key: "v" },
    ];
    for (const [k, v] of summary) summarySheet.addRow({ k, v });

    const eventsSheet = wb.addWorksheet("Events");
    eventsSheet.columns = COLUMNS.map((c) => ({ header: c, key: c }));
    for (const r of rows) {
      eventsSheet.addRow({
        event_id: r.event_id,
        occurred_at: r.occurred_at,
        event_type: r.event_type,
        theater: r.theater,
        location_name: r.location_name ?? "",
        lat: r.lat,
        lon: r.lon,
        source_count: r.source_count,
        confidence: r.confidence,
        platforms: r.platforms.join(","),
      });
    }
    eventsSheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const sheet of [summarySheet, eventsSheet]) {
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((col) => {
        let max = typeof col.header === "string" ? col.header.length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const len = cell.value == null ? 0 : String(cell.value).length;
          if (len > max) max = len;
        });
        col.width = Math.min(Math.max(max + 2, 10), 60);
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }

  // CSV
  const EOL = "\r\n";
  const lines: string[] = [];
  for (const [k, v] of summary) lines.push(`# ${csvField(k)},${csvField(v)}`);
  lines.push(""); // blank row separating the summary block from the table
  lines.push(COLUMNS.map(csvField).join(","));
  for (const r of rows) lines.push(rowValues(r).map(csvField).join(","));

  return new Response(lines.join(EOL) + EOL, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
    },
  });
}
