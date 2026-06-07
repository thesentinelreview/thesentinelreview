import type { SourceDetail } from "@/lib/types";
import { getAllSources } from "@/lib/queries";
import Panel from "@/components/ds/Panel";
import Badge from "@/components/ds/Badge";
import { RELIABILITY } from "@/components/ds/tokens";

export const dynamic = "force-dynamic";

// Shared 6-column grid template for the table header + rows (kept identical so
// columns align). Horizontal scroll handles narrow viewports via the wrapper.
const COLS = "grid-cols-[32px_1fr_64px_72px_120px_96px]";

function fmtRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!d.getTime()) return "—";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 0) return "—";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Verified-rate label colour — mirrors the reliability banding (token
// thresholds) in the matching -400 text shades. The bar fill + track come
// straight from RELIABILITY.
function rateLabelColor(r: number): string {
  if (r >= RELIABILITY.thresholds.high) return "text-emerald-400";
  if (r >= RELIABILITY.thresholds.medium) return "text-amber-400";
  return "text-red-400";
}

export default async function SourcesPage() {
  const allSources = await getAllSources();
  const totalSources = allSources.length;
  const avgRate = totalSources === 0
    ? 0
    : Math.round(allSources.reduce((a, b) => a + b.verified_rate, 0) / totalSources);

  return (
    <div className="sources-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-6xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 pb-3 border-b border-slate-800/60">
          <div className="flex flex-col gap-1">
            <h1 className="text-[13px] font-data tracking-[0.18em] uppercase text-slate-200">
              Source Reliability
            </h1>
            <p className="text-[12px] font-data text-slate-400">
              {totalSources} active sources · {avgRate}% average verification rate
            </p>
          </div>
          <div className="shrink-0 text-right text-[10px] font-data uppercase tracking-[0.12em] text-slate-500 leading-relaxed">
            Rolling 30-day stats<br />Updated hourly
          </div>
        </div>

        {/* Table */}
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className={`grid ${COLS} gap-3 px-4 py-2.5 border-b border-slate-800/60 text-[9px] font-data uppercase tracking-[0.12em] text-slate-500`}>
                <span>#</span>
                <span>Source</span>
                <span>Today</span>
                <span>30-day</span>
                <span>Verified rate</span>
                <span className="text-right">Last seen</span>
              </div>

              {allSources.length === 0 ? (
                <div className="px-4 py-10 text-center text-[11px] font-data uppercase tracking-[0.08em] text-slate-500">
                  No active sources.
                </div>
              ) : (
                allSources.map((src: SourceDetail) => (
                  <div
                    key={src.handle}
                    className={`grid ${COLS} gap-3 px-4 py-3.5 items-center border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/20 transition-colors`}
                  >
                    <div className="font-data text-[10px] text-slate-500">
                      {String(src.rank).padStart(2, "0")}
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm">{src.display_name}</span>
                        <Badge variant="platform" value={src.platform} className="shrink-0" />
                        <Badge variant="tier" value={src.trust_tier} className="shrink-0" />
                      </div>
                      {src.notes && (
                        <div className="text-[11px] text-slate-400 leading-relaxed">{src.notes}</div>
                      )}
                    </div>

                    <div>
                      <div className="font-data text-base font-semibold text-slate-100 leading-none">
                        {src.events_count}
                      </div>
                      <div className="mt-1 font-data text-[10px] uppercase tracking-wider text-slate-500">
                        today
                      </div>
                    </div>

                    <div>
                      <div className="font-data text-base font-semibold text-slate-100 leading-none">
                        {src.events_30d}
                      </div>
                      <div className="mt-1 font-data text-[10px] uppercase tracking-wider text-slate-500">
                        30-day
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className={`h-[3px] rounded overflow-hidden ${RELIABILITY.track}`}>
                        <div
                          className={`h-full rounded ${RELIABILITY.barColor(src.verified_rate)}`}
                          style={{ width: `${src.verified_rate}%` }}
                        />
                      </div>
                      <span className={`font-data text-[11px] ${rateLabelColor(src.verified_rate)}`}>
                        {src.verified_rate}%
                      </span>
                    </div>

                    <div className="font-data text-[10px] text-slate-500 text-right">
                      {fmtRelativeDate(src.last_event_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>

        {/* Footer note */}
        <Panel padding="sm" className="text-[12px] text-slate-400 leading-relaxed">
          <strong className="font-medium text-slate-200">Verification rate</strong> measures the percentage of
          events from a given source that reached <em>verified</em> or <em>partial</em> confidence status over the
          rolling 30-day window. A low rate does not mean a source is unreliable — high-volume milblog channels
          produce many unverified reports that are later corroborated.{" "}
          <strong className="font-medium text-slate-200">Trust tier</strong> reflects editorial weighting, not
          verification rate alone. See{" "}
          <a
            href="/methodology"
            className="text-slate-300 underline underline-offset-2 hover:text-slate-100"
          >
            /methodology
          </a>{" "}
          for the full rubric.
        </Panel>
      </div>
    </div>
  );
}
