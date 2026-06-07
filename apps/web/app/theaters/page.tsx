import Link from "next/link";
import type { TheaterConfig } from "@/lib/types";
import { THEATERS, THEATER_CONTENT } from "@/data/theaters";
import { getStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title:       "Theaters — Sentinel Review",
  description: "Live OSINT conflict coverage across Ukraine, Iran, Sudan, and Myanmar.",
};

interface TheaterCardData {
  theater:  TheaterConfig;
  tagline:  string;
  events:   number;
  verified: number;
}

async function loadCards(): Promise<TheaterCardData[]> {
  const entries = Object.values(THEATERS);
  const stats = await Promise.all(entries.map((t) => getStats(t.id, "24h")));
  return entries.map((theater, i) => ({
    theater,
    tagline:  THEATER_CONTENT[theater.id].tagline,
    events:   stats[i].events,
    verified: stats[i].verified_pct,
  }));
}

export default async function TheatersIndexPage() {
  const cards = await loadCards();

  return (
    <div className="theaters-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-3xl mx-auto px-5 py-6 pb-20 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Theaters</h1>
          <p className="text-sm text-slate-400">
            Live OSINT conflict coverage across four active theaters. Updated every 30 minutes.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ theater, tagline, events, verified }) => (
            <Link
              key={theater.id}
              href={`/theaters/${theater.id}`}
              className="group bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl hover:border-slate-600 transition-all p-6 flex flex-col gap-4 no-underline"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-bold text-slate-100">{theater.label}</span>
                <span className="text-slate-500 group-hover:text-red-400 transition-colors">→</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{tagline}</p>
              <div className="flex gap-8">
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">{events}</div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Events 24h</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">
                    {verified}<span className="text-base text-slate-500">%</span>
                  </div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Verified</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="text-[10px] font-data tracking-[0.04em] text-slate-500 leading-relaxed pt-4 border-t border-slate-800/60">
          ⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
        </div>
      </div>
    </div>
  );
}
