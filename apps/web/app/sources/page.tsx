import Link from "next/link";
import { Radio } from "lucide-react";
import MarketingHeader from "@/components/marketing/Header";
import SensorStrip from "@/components/watchfloor/SensorStrip";
import type { Platform, SourceDetail } from "@/lib/types";
import { getAllSources, getSensorStripData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title:       "Source Reliability — Sentinel Review",
  description:
    "Verification rates and editorial trust tiers for every source feeding the Sentinel Review ingestion pipeline.",
};

const CARD =
  "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl";

const PLATFORM_STYLE: Record<Platform, { label: string; cls: string }> = {
  rss:      { label: "RSS",  cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  x:        { label: "X",    cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
  telegram: { label: "TG",   cls: "text-blue-300 bg-blue-500/10 border-blue-500/30" },
  bluesky:  { label: "BSky", cls: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" },
  wire:     { label: "Wire", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
};
const PLATFORM_FALLBACK_CLS = "text-slate-300 bg-slate-700/30 border-slate-600/40";

const TIER_STYLE: Record<1 | 2 | 3, { label: string; cls: string }> = {
  1: { label: "High trust", cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  2: { label: "Med trust",  cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  3: { label: "Low trust",  cls: "text-slate-300 bg-slate-700/30 border-slate-600/40" },
};

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

function rateTone(rate: number): string {
  if (rate >= 35) return "text-emerald-400";
  if (rate >= 20) return "text-amber-400";
  return "text-slate-500";
}

function rateBarTone(rate: number): string {
  if (rate >= 35) return "bg-emerald-400";
  if (rate >= 20) return "bg-amber-400";
  return "bg-slate-500";
}

export default async function SourcesPage() {
  const [allSources, sensorData] = await Promise.all([
    getAllSources(),
    getSensorStripData("ukraine"),
  ]);
  const totalSources = allSources.length;
  const avgRate =
    totalSources === 0
      ? 0
      : Math.round(
          allSources.reduce((a, b) => a + b.verified_rate, 0) / totalSources,
        );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <MarketingHeader />
      <SensorStrip data={sensorData} />

      <main className="p-6 max-w-[1800px] mx-auto space-y-6">
        {/* Header card */}
        <section className={`${CARD} p-6`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <Radio className="w-4 h-4 text-blue-400" />
                </div>
                <h1 className="text-lg font-bold text-slate-100">Source Reliability</h1>
              </div>
              <p className="text-sm text-slate-500 font-mono">
                {totalSources} active source{totalSources === 1 ? "" : "s"} · {avgRate}% average verification rate
              </p>
            </div>
            <div className="text-[10px] text-slate-600 font-mono uppercase tracking-widest text-right">
              Rolling 30-day stats
              <br />
              Updated hourly
            </div>
          </div>
        </section>

        {/* Table card */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="hidden md:grid grid-cols-[28px_1fr_72px_72px_180px_88px] gap-4 px-5 py-3 border-b border-slate-700/60 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span>#</span>
            <span>Source</span>
            <span className="text-right">Today</span>
            <span className="text-right">30-day</span>
            <span>Verified rate</span>
            <span className="text-right">Last seen</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {allSources.map((src: SourceDetail) => {
              const platform = PLATFORM_STYLE[src.platform];
              const platformLabel = platform?.label ?? src.platform?.toUpperCase() ?? "—";
              const platformCls = platform?.cls ?? PLATFORM_FALLBACK_CLS;
              const tier =
                src.trust_tier === 1 || src.trust_tier === 2 || src.trust_tier === 3
                  ? src.trust_tier
                  : 2;
              const tierStyle = TIER_STYLE[tier];

              return (
                <div
                  key={src.handle}
                  className="grid grid-cols-1 md:grid-cols-[28px_1fr_72px_72px_180px_88px] gap-3 md:gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors items-start md:items-center"
                >
                  <div className="text-[10px] text-slate-700 font-mono">
                    {String(src.rank).padStart(2, "0")}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-100 text-sm truncate">
                        {src.display_name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${platformCls}`}
                      >
                        {platformLabel}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${tierStyle.cls}`}
                      >
                        {tierStyle.label}
                      </span>
                    </div>
                    {src.notes && (
                      <div className="text-xs text-slate-500 leading-relaxed mt-1">
                        {src.notes}
                      </div>
                    )}
                  </div>

                  <div className="md:text-right">
                    <div className="text-sm font-bold text-slate-200 tabular-nums">
                      {src.events_count}
                    </div>
                    <div className="text-[9px] text-slate-600 uppercase tracking-widest md:hidden">
                      today
                    </div>
                  </div>

                  <div className="md:text-right">
                    <div className="text-sm font-bold text-slate-200 tabular-nums">
                      {src.events_30d}
                    </div>
                    <div className="text-[9px] text-slate-600 uppercase tracking-widest md:hidden">
                      30-day
                    </div>
                  </div>

                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${rateBarTone(src.verified_rate)}`}
                        style={{ width: `${Math.min(100, Math.max(0, src.verified_rate))}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs font-bold tabular-nums w-10 text-right ${rateTone(src.verified_rate)}`}
                    >
                      {src.verified_rate}%
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-mono md:text-right">
                    {fmtRelativeDate(src.last_event_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer note */}
        <section className={`${CARD} p-5`}>
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Verification rate</strong> measures the percentage of events from a given source
            that reached <em>verified</em> or <em>partial</em> confidence status over the rolling 30-day window. A low rate
            does not mean a source is unreliable — high-volume milblog channels produce many unverified reports that are
            later corroborated.{" "}
            <strong className="text-slate-200">Trust tier</strong> reflects editorial weighting, not verification rate alone.
            See the{" "}
            <Link
              href="/methodology"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              /methodology
            </Link>{" "}
            page for the full rubric.
          </p>
        </section>
      </main>
    </div>
  );
}
