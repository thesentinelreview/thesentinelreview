import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { resolveTieoutTheater, THEATERS } from "@/data/theaters";
import {
  getFusionCounts,
  getTieoutRows,
  resolveTieoutWindow,
  tieoutSummary,
  type TieoutTheater,
  type TieoutWindow,
} from "@/lib/queries";
import Panel from "@/components/ds/Panel";
import FilterChip from "@/components/ds/FilterChip";
import KpiTile from "@/components/ds/KpiTile";
import AdminNav from "@/components/ds/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fusion Tie-out — Sentinel Admin" };

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";
const BTN =
  "px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider hover:bg-amber-500/20";

const WINDOWS: TieoutWindow[] = ["24h", "7d", "30d", "all"];
const WINDOW_LABELS: Record<TieoutWindow, string> = { "24h": "24H", "7d": "7D", "30d": "30D", all: "ALL" };

function buildHref(theater: TieoutTheater, window: TieoutWindow): string {
  const p = new URLSearchParams();
  p.set("theater", theater);
  if (window !== "24h") p.set("window", window);
  return `/admin/tieout?${p}`;
}

function exportHref(format: "csv" | "xlsx", theater: TieoutTheater, window: TieoutWindow): string {
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

// Token confidence semantics: verified = emerald · partial = amber · unconfirmed = slate.
function confidenceClass(c: string): string {
  if (c === "verified") return "text-emerald-400";
  if (c === "partial") return "text-amber-400";
  return "text-slate-500";
}

export default async function TieoutPage({
  searchParams,
}: {
  searchParams: Promise<{ theater?: string; window?: string }>;
}) {
  if (!(await isAdmin())) redirect("/sign-in");

  const params = await searchParams;
  const theater = resolveTieoutTheater(params.theater);
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
    <div className="admin-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-8 flex flex-col gap-5">
        {/* Title */}
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">Fusion tie-out</h1>
            <Link
              href={`/?theater=${theater.id === "all" ? "ukraine" : theater.id}${window === "24h" ? "" : `&window=${window === "all" ? "7d" : window}`}`}
              className="text-xs font-data uppercase tracking-wider text-slate-400 hover:text-slate-200"
            >
              ← Watchfloor
            </Link>
          </div>
          <p className="text-sm text-slate-400">
            Audit page for the Fusion KPI: every published event in the theater bbox with its
            distinct source count, tied out against the counts behind the value shown on /.
          </p>
          <div className="text-xs font-data text-slate-500">
            {theater.label} · {WINDOW_LABELS[window]} · generated {generatedAt}
          </div>
          <AdminNav active="/admin/tieout" />
        </div>

        {/* KPI rail */}
        <div className="flex flex-col sm:flex-row gap-3">
          <KpiTile label="Total events" value={b.total} hint="published, in theater bbox" />
          <KpiTile label="Multi-source" value={b.multiSource} hint="≥ 2 distinct sources" />
          <KpiTile
            label="Fusion · Method A"
            value={methodA ?? "—"}
            unit={methodA == null ? "" : "%"}
            hint="value shown on /"
          />
          <KpiTile
            label="Fusion · Method B"
            value={methodB ?? "—"}
            unit={methodB == null ? "" : "%"}
            hint="derived from rows below"
          />
        </div>

        {/* Tie-out status */}
        {mismatch ? (
          <Panel padding="sm" className="border-amber-500/40 bg-amber-500/5 text-amber-300 text-sm">
            <span className="font-semibold uppercase tracking-wider text-xs">
              Tie-out mismatch
            </span>{" "}
            — Method A counts (total {a.total}, multi-source {a.multiSource}) differ from the
            rows below (total {b.total}, multi-source {b.multiSource}). The Fusion KPI on{" "}
            <span className="font-data">/</span> may not reflect this table.
          </Panel>
        ) : (
          <div className="text-xs font-data text-slate-500">
            Methods agree — counts tie out (A {a.multiSource}/{a.total} · B {b.multiSource}/
            {b.total}).
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`${LABEL} mr-1`}>Theater</span>
              {Object.values(THEATERS).map((t) => (
                <FilterChip key={t.id} href={buildHref(t.id, window)} active={t.id === theater.id}>
                  {t.label}
                </FilterChip>
              ))}
              <FilterChip key="all" href={buildHref("all", window)} active={theater.id === "all"}>
                Global
              </FilterChip>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`${LABEL} mr-1`}>Window</span>
              {WINDOWS.map((w) => (
                <FilterChip key={w} href={buildHref(theater.id, w)} active={w === window}>
                  {WINDOW_LABELS[w]}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={exportHref("csv", theater.id, window)} className={BTN}>
              Export CSV
            </a>
            <a href={exportHref("xlsx", theater.id, window)} className={BTN}>
              Export XLSX
            </a>
          </div>
        </div>

        {/* Table */}
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-800/60">
                  <th className={`${LABEL} px-4 py-2.5 font-medium`}>Event</th>
                  <th className={`${LABEL} px-4 py-2.5 font-medium`}>Occurred (UTC)</th>
                  <th className={`${LABEL} px-4 py-2.5 font-medium`}>Type</th>
                  <th className={`${LABEL} px-4 py-2.5 font-medium`}>Location</th>
                  <th className={`${LABEL} px-4 py-2.5 font-medium text-right`}>Sources</th>
                  <th className={`${LABEL} px-4 py-2.5 font-medium`}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.event_id} className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/30">
                    <td className="px-4 py-2 font-data text-xs">
                      <Link href={`/event/${r.event_id}`} className="text-amber-400 hover:text-amber-300 hover:underline">
                        {r.event_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-data text-xs whitespace-nowrap">
                      <span className="text-slate-300">{r.occurred_at}</span>
                      <span className="text-slate-600 ml-2">{fmtRelative(r.occurred_at)}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{r.event_type}</td>
                    <td className="px-4 py-2 text-slate-300">{r.location_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className={r.source_count >= 2 ? "text-emerald-400" : "text-slate-400"}>
                        {r.source_count}
                      </span>
                    </td>
                    <td className={`px-4 py-2 font-data text-xs uppercase tracking-wider ${confidenceClass(r.confidence)}`}>
                      {r.confidence}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      No published events in this theater/window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
