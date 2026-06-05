import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import MarketingHeader from "@/components/marketing/Header";
import SensorStrip from "@/components/watchfloor/SensorStrip";
import TheaterPostCard from "@/components/marketing/TheaterPostCard";
import type { TheaterKey } from "@/lib/types";
import { THEATERS, THEATER_CONTENT } from "@/data/theaters";
import {
  getStats,
  getTopSources,
  getSourceFeedPosts,
  getSensorStripData,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const VALID: TheaterKey[] = ["ukraine", "iran", "sudan", "myanmar"];

function isTheaterKey(x: string): x is TheaterKey {
  return (VALID as string[]).includes(x);
}

const CARD =
  "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ theater: string }>;
}) {
  const { theater } = await params;
  if (!isTheaterKey(theater)) {
    return { title: "Theater not found — Sentinel Review" };
  }
  const content = THEATER_CONTENT[theater];
  return {
    title:       content.seoTitle,
    description: content.seoDescription,
  };
}

export default async function TheaterDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ theater: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const { theater } = await params;
  const { before }  = await searchParams;

  if (!isTheaterKey(theater)) notFound();

  const cfg     = THEATERS[theater];
  const content = THEATER_CONTENT[theater];

  const [stats24h, stats7d, stats30d, sources, feedPage, sensorData] =
    await Promise.all([
      getStats(theater, "24h"),
      getStats(theater, "7d"),
      getStats(theater, "30d"),
      getTopSources(theater, 5),
      getSourceFeedPosts(theater, { before }),
      getSensorStripData(theater),
    ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <MarketingHeader />
      <SensorStrip data={sensorData} />

      <main className="p-6 max-w-[1800px] mx-auto">
        {/* Hero header */}
        <section className={`${CARD} p-6 mb-6`}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-600 mb-3 flex-wrap">
            <Link href="/theaters" className="hover:text-slate-400 transition-colors">
              Theaters
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-400">{cfg.label}</span>
            <ChevronRight className="w-3 h-3" />
            <span>{cfg.mapSubtitle.replace(/^[^—]+—\s*/, "")}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 uppercase tracking-widest mb-1">
            {cfg.label} Theater
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
            {cfg.mapSubtitle}
          </p>
        </section>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Left — AI source feed */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                AI Source Feed
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-semibold">Live</span>
              </div>
            </div>

            {feedPage.posts.length === 0 ? (
              <div className={`${CARD} p-10 text-center`}>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  No source posts yet for this theater.
                </span>
              </div>
            ) : (
              <>
                {feedPage.posts.map((post) => (
                  <TheaterPostCard key={post.id} post={post} />
                ))}

                {feedPage.next_before && (
                  <div className="flex justify-center pt-2">
                    <Link
                      href={`/theaters/${theater}?before=${feedPage.next_before}`}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 transition-colors"
                    >
                      Load older posts →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right — sidebar */}
          <div className="space-y-6">
            {/* Live Activity */}
            <section className={`${CARD} p-5`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                Live Activity
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums">
                    {stats24h.events}
                  </div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">
                    Events 24h
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums">
                    {stats7d.events}
                  </div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">
                    Events 7d
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-100 tabular-nums">
                    {stats30d.events}
                  </div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1">
                    Events 30d
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-600 font-mono uppercase tracking-widest">
                <span>Rolling windows</span>
                <span>Verified 7d: {stats7d.verified_pct}%</span>
              </div>
            </section>

            {/* About this theater */}
            <section className={`${CARD} p-5`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                About This Theater
              </h3>
              <div className="space-y-3">
                {content.paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className={`text-xs leading-relaxed ${i === 0 ? "text-slate-400" : "text-slate-500"}`}
                  >
                    {p}
                  </p>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/60 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
                Coverage since {content.since}
              </div>
            </section>

            {/* Key Actors */}
            <section className={`${CARD} p-5`}>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Key Actors
              </h3>
              <ul className="space-y-2">
                {content.keyActors.map((actor) => (
                  <li
                    key={actor}
                    className="flex items-start gap-2.5 text-xs text-slate-400"
                  >
                    <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0 mt-1.5" />
                    {actor}
                  </li>
                ))}
              </ul>
            </section>

            {/* Top Sources */}
            {sources.length > 0 && (
              <section className={`${CARD} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-slate-700/60">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Top Sources (30-day verification rate)
                  </h3>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {sources.map((src) => (
                    <div
                      key={src.rank}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors"
                    >
                      <span className="text-[10px] text-slate-700 font-mono w-4 shrink-0">
                        {String(src.rank).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-slate-300 flex-1 truncate">
                        {src.display_name}
                      </span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {src.events_count} events
                      </span>
                      <span
                        className={`text-xs font-bold tabular-nums w-10 text-right ${
                          src.verified_rate >= 35
                            ? "text-emerald-400"
                            : src.verified_rate >= 20
                              ? "text-amber-400"
                              : "text-slate-500"
                        }`}
                      >
                        {src.verified_rate}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-slate-700/60">
                  <Link
                    href="/sources"
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 font-mono transition-colors"
                  >
                    See all sources <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </section>
            )}
          </div>
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
