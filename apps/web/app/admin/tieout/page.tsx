import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { resolveTheater, THEATERS } from "@/data/theaters";
import {
  getFusionCounts,
  getTieoutRows,
  resolveTieoutWindow,
  tieoutSummary,
  type TieoutWindow,
} from "@/lib/queries";
import type { TheaterKey } from "@/lib/types";
import Kpi from "@/components/watchfloor/Kpi";

export const dynamic = "force-dynamic";

const WINDOWS: TieoutWindow[] = ["24h", "7d", "all"];
const WINDOW_LABELS: Record<TieoutWindow, string> = { "24h": "24H", "7d": "7D", all: "ALL" };

function buildHref(theater: TheaterKey, window: TieoutWindow): string {
  const p = new URLSearchParams();
  p.set("theater", theater);
  if (window !== "24h") p.set("window", window);
  return `/admin/tieout?${p}`;
}

function exportHref(format: "csv" | "xlsx", theater: TheaterKey, window: TieoutWindow): string {
  const p = new URLSearchParams({ format, theater, window });
  return `/admin/tieout/export?${p}`;
}

function pct(multiSource: number, total: number): number | null {
  return total === 0 ? null : Math.round((multiSource / total) * 100);
}

function fmtRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 0) return "—";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confidenceClass(c: string): string {
  if (c === "verified") return "text-emerald-400";
  if (c === "partial") return "text-amber-400";
  return "text-zinc-500";
}

const chipClass = (active: boolean) =>
  `px-3 py-1.5 text-[11px] tracking-[0.08em] rounded-sm border font-data uppercase ${
    active
      ? "text-teal-300 bg-teal-400/[0.06] border-teal-400/30"
      : "text-zinc-300 border-zinc-800 hover:bg-zinc-800"
  }`;

export default async function TieoutPage({
  searchParams,
}: {
  searchParams: Promise<{ theater?: string; window?: string }>;
}) {
  if (!(await isAdmin())) redirect("/sign-in");

  const params = await searchParams;
  const theater = resolveTheater(params.theater);
  const window = resolveTieoutWindow(params.window);

  const [rows, fusionCounts] = await Promise.all([
    getTieoutRows(theater.id, window),
    getFusionCounts(theater.id, window),
  ]);

  const a = fusionCounts ?? { total: 0, multiSource: 0 };
  const b = tieoutSummary(rows);
  const methodA = pct(a.multiSource, a.total);
  const methodB = b.fusionPct;
  const mismatch = a.total !== b.total || a.multiSource !== b.multiSource;
  const generatedAt = new Date().toISOString();

  return (
    <div className="min-h-screen bg-[#05070A] text-zinc-100 font-ui">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-col gap-5">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-bold tracking-[0.25em] uppercase text-white">
                Fusion Tie-Out
              </h1>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-[0.2em] font-data">
                Admin
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 font-data">
              {theater.label} · {WINDOW_LABELS[window]} · generated {generatedAt}
            </div>
          </div>
          <Link
            href={`/?theater=${theater.id}${window === "24h" ? "" : `&window=${window === "all" ? "7d" : window}`}`}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 tracking-[0.08em] uppercase font-data self-start sm:self-auto"
          >
            ← Watchfloor
          </Link>
        </div>

        {/* KPI rail */}
        <div className="flex flex-col sm:flex-row gap-1.5">
          <Kpi label="Total events" value={b.total} hint="published, in theater bbox" />
          <Kpi label="Multi-source" value={b.multiSource} hint="≥ 2 distinct sources" />
          <Kpi
            label="Fusion · Method A"
            value={methodA ?? "—"}
            unit={methodA == null ? "" : "%"}
            hint="value shown on /"
          />
          <Kpi
            label="Fusion · Method B"
            value={methodB ?? "—"}
            unit={methodB == null ? "" : "%"}
            hint="derived from rows below"
          />
        </div>

        {/* Tie-out status */}
        {mismatch ? (
          <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-[12px]">
            <span className="font-semibold uppercase tracking-[0.16em] text-[11px]">
              Tie-out mismatch
            </span>{" "}
            — Method A counts (total {a.total}, multi-source {a.multiSource}) differ from the
            rows below (total {b.total}, multi-source {b.multiSource}). The Fusion KPI on{" "}
            <span className="font-data">/</span> may not reflect this table.
          </div>
        ) : (
          <div className="text-[11px] text-zinc-500 font-data">
            Methods agree — counts tie out (A {a.multiSource}/{a.total} · B {b.multiSource}/
            {b.total}).
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mr-1">
                Theater
              </span>
              {Object.values(THEATERS).map((t) => (
                <Link key={t.id} href={buildHref(t.id, window)} className={chipClass(t.id === theater.id)}>
                  {t.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mr-1">
                Window
              </span>
              {WINDOWS.map((w) => (
                <Link key={w} href={buildHref(theater.id, w)} className={chipClass(w === window)}>
                  {WINDOW_LABELS[w]}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportHref("csv", theater.id, window)}
              className="px-2.5 py-1.5 text-[10px] rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 tracking-wider uppercase font-data hover:bg-zinc-800 hover:text-zinc-100"
            >
              Export CSV
            </a>
            <a
              href={exportHref("xlsx", theater.id, window)}
              className="px-2.5 py-1.5 text-[10px] rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 tracking-wider uppercase font-data hover:bg-zinc-800 hover:text-zinc-100"
            >
              Export XLSX
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="bg-zinc-950/60 border border-zinc-900 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-zinc-500 uppercase tracking-[0.16em] text-[10px] border-b border-zinc-900">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Occurred (UTC)</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium text-right">Sources</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.event_id} className="border-b border-zinc-900/60 hover:bg-zinc-900/40">
                    <td className="px-3 py-2 font-data">
                      <Link href={`/event/${r.event_id}`} className="text-teal-300 hover:underline">
                        {r.event_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-data text-zinc-400 whitespace-nowrap">
                      <span className="text-zinc-300">{r.occurred_at}</span>
                      <span className="text-zinc-600 ml-2">{fmtRelative(r.occurred_at)}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{r.event_type}</td>
                    <td className="px-3 py-2 text-zinc-300">{r.location_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={r.source_count >= 2 ? "text-teal-300" : "text-zinc-400"}>
                        {r.source_count}
                      </span>
                    </td>
                    <td className={`px-3 py-2 font-data uppercase tracking-[0.08em] ${confidenceClass(r.confidence)}`}>
                      {r.confidence}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                      No published events in this theater/window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
