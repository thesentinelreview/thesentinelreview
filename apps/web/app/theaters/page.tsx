import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import MarketingHeader from "@/components/marketing/Header";
import SensorStrip from "@/components/watchfloor/SensorStrip";
import { THEATERS, THEATER_CONTENT } from "@/data/theaters";
import { getStats, getSensorStripData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title:       "Theaters — Sentinel Review",
  description: "Live OSINT conflict coverage across Ukraine, Iran, Sudan, and Myanmar.",
};

const CARD =
  "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl";

export default async function TheatersIndexPage() {
  const entries = Object.values(THEATERS);
  const [stats, sensorData] = await Promise.all([
    Promise.all(entries.map((t) => getStats(t.id, "24h"))),
    // Theaters index has no specific theater — default to ukraine so the strip
    // still carries real data instead of being a hardcoded shell.
    getSensorStripData("ukraine"),
  ]);

  const cards = entries.map((theater, i) => ({
    theater,
    tagline:  THEATER_CONTENT[theater.id].tagline,
    events:   stats[i].events,
    verified: stats[i].verified_pct,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <MarketingHeader />
      <SensorStrip data={sensorData} />

      <main className="p-6 max-w-[1800px] mx-auto">
        <section className={`${CARD} mb-6`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Theaters</h2>
          </div>
          <p className="text-sm text-slate-500 font-mono">
            Live OSINT conflict coverage across four active theaters. Updated every 30 minutes.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cards.map(({ theater, tagline, events, verified }) => (
            <Link
              key={theater.id}
              href={`/theaters/${theater.id}`}
              className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl hover:border-slate-500 hover:bg-slate-800/60 transition-all group block"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-bold text-slate-100 uppercase tracking-widest">
                  {theater.label}
                </h3>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all shrink-0 mt-0.5" />
              </div>

              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                {tagline}
              </p>

              <div className="border-t border-slate-800/60 pt-4 grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                    Events 24H
                  </div>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums">
                    {events}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                    Verified
                  </div>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums">
                    {verified}
                    <span className="text-sm font-semibold text-slate-500 ml-0.5">%</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-slate-700 font-mono">
            AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
          </p>
        </div>
      </main>
    </div>
  );
}
