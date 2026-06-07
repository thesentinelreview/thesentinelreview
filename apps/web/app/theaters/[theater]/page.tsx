import Link from "next/link";
import { notFound } from "next/navigation";
import type { TheaterKey } from "@/lib/types";
import { THEATERS, THEATER_CONTENT } from "@/data/theaters";
import {
  getStats,
  getTopSources,
  getLatestBriefing,
  getSourceFeedPosts,
} from "@/lib/queries";
import { groupByDay } from "@/lib/day-groups";
import { cn } from "@/lib/cn";
import Panel from "@/components/ds/Panel";
import PostCard from "@/components/ds/PostCard";
import { RELIABILITY } from "@/components/ds/tokens";

export const dynamic = "force-dynamic";

const VALID: TheaterKey[] = ["ukraine", "iran", "sudan", "myanmar"];

function isTheaterKey(x: string): x is TheaterKey {
  return (VALID as string[]).includes(x);
}

// View-switch segmented control (red active matches the global header's active nav).
const CHIP = "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all";
const CHIP_ACTIVE = "bg-red-500/10 border-red-500/30 text-red-400";
const CHIP_INACTIVE = "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300";

// DS uppercase section label + slate CTA link.
const LABEL = "text-[12px] font-data tracking-[0.18em] uppercase text-slate-400";
const CTA = "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 border border-slate-700 bg-slate-900 hover:text-slate-100 hover:border-slate-600 transition-all";

// Verification-rate banding — same thresholds/colours as /sources.
function rateColor(r: number): string {
  if (r >= RELIABILITY.thresholds.high) return "text-emerald-400";
  if (r >= RELIABILITY.thresholds.medium) return "text-amber-400";
  return "text-red-400";
}

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
  searchParams: Promise<{ view?: string; before?: string }>;
}) {
  const { theater }               = await params;
  const { view: rawView, before } = await searchParams;

  if (!isTheaterKey(theater)) notFound();

  const view    = rawView === "ai" ? "ai" : "sources";
  const cfg     = THEATERS[theater];
  const content = THEATER_CONTENT[theater];

  // Branch data fetching by mode (unchanged).
  const feedPage = view === "sources"
    ? await getSourceFeedPosts(theater, { before })
    : null;

  const [stats24h, stats7d, stats30d, sources, briefing] =
    view === "ai"
      ? await Promise.all([
          getStats(theater, "24h"),
          getStats(theater, "7d"),
          getStats(theater, "30d"),
          getTopSources(theater, 5),
          getLatestBriefing(theater),
        ])
      : [null, null, null, null, null];

  const groups = feedPage ? groupByDay(feedPage.posts) : [];

  return (
    <div className="theater-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <Link
            href="/theaters"
            className="w-fit text-[10px] font-data tracking-[0.18em] uppercase text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← All theaters
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">{cfg.label} theater</h1>
          <p className="text-sm text-slate-400">{cfg.mapSubtitle}</p>
          <p className="text-sm text-slate-500">Coverage since {content.since}</p>
        </div>

        {/* View switch */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="mr-1 text-[10px] font-data tracking-[0.18em] uppercase text-slate-500">View</span>
          <Link
            href={`/theaters/${theater}?view=sources`}
            className={cn(CHIP, view === "sources" ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            Source feed
          </Link>
          <Link
            href={`/theaters/${theater}?view=ai`}
            className={cn(CHIP, view === "ai" ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            AI verification
          </Link>
        </div>

        {/* ── SOURCE FEED VIEW ─────────────────────────────────────────── */}
        {view === "sources" && (
          <>
            {feedPage!.posts.length === 0 ? (
              <Panel padding="md" className="text-center text-[11px] font-data tracking-[0.08em] uppercase text-slate-500">
                No source posts yet for this theater — run the backfill workflow to populate.
              </Panel>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group) => (
                  <section key={group.key} className="flex flex-col gap-3">
                    <div className="flex justify-between items-baseline pb-2 mt-3 first:mt-0 border-b border-slate-800/60">
                      <span className="text-[12px] font-data tracking-[0.08em] uppercase text-slate-300">
                        {group.label}
                      </span>
                      <span className="text-[10px] font-data tracking-[0.08em] uppercase text-slate-500">
                        {group.posts.length} post{group.posts.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {group.posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </section>
                ))}
              </div>
            )}

            {feedPage!.next_before && (
              <div className="flex justify-center pt-3">
                <Link
                  href={`/theaters/${theater}?view=sources&before=${feedPage!.next_before}`}
                  className="px-4 py-2 rounded-lg text-[11px] font-semibold tracking-wider uppercase text-slate-300 border border-slate-700 bg-slate-900 hover:text-slate-100 hover:border-slate-600 transition-all"
                >
                  Load older posts →
                </Link>
              </div>
            )}

            <div className="text-[10px] font-data tracking-[0.04em] text-slate-500 leading-relaxed pt-4 border-t border-slate-800/60">
              ⚠ AI-translated content. Original-language text available via the &ldquo;Show original&rdquo; toggle on each card.
              Events sourced from open-source reporting; locations and details unverified. Not for operational use.
            </div>
          </>
        )}

        {/* ── AI VERIFICATION VIEW ─────────────────────────────────────── */}
        {view === "ai" && (
          <>
            {/* Live activity */}
            <Panel padding="md" className="flex flex-col gap-4">
              <div className={LABEL}>Live activity</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">{stats24h!.events}</div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Events 24h</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">{stats7d!.events}</div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Events 7d</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">{stats30d!.events}</div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Events 30d</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none">
                    {stats7d!.verified_pct}<span className="text-base text-slate-500">%</span>
                  </div>
                  <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-400">Verified (7d)</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={`/?theater=${theater}`} className={CTA}>View live map →</Link>
                <Link href={`/app/feed?theater=${theater}`} className={CTA}>Browse Source Feed →</Link>
                {briefing && (
                  <Link href={`/briefing/${briefing.id}?theater=${theater}`} className={CTA}>
                    Read latest briefing →
                  </Link>
                )}
              </div>
            </Panel>

            {/* About this theater */}
            <Panel padding="md" className="flex flex-col gap-3">
              <div className={LABEL}>About this theater</div>
              <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
                {content.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Panel>

            {/* Key actors */}
            <Panel padding="md" className="flex flex-col gap-3">
              <div className={LABEL}>Key actors</div>
              <ul className="list-disc pl-5 flex flex-col gap-1 text-sm text-slate-300 leading-relaxed">
                {content.keyActors.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Panel>

            {/* Top sources */}
            {sources!.length > 0 && (
              <Panel padding="md" className="flex flex-col gap-3">
                <div className={LABEL}>Top sources (30-day verification rate)</div>
                <div className="flex flex-col">
                  {sources!.map((src) => (
                    <div
                      key={src.rank}
                      className="grid grid-cols-[28px_1fr_auto_auto] gap-3 items-baseline py-2 border-b border-slate-800/60 last:border-b-0"
                    >
                      <span className="font-data text-[10px] text-slate-500">{String(src.rank).padStart(2, "0")}</span>
                      <span className="text-sm text-slate-200 truncate">{src.display_name}</span>
                      <span className="font-data text-xs text-slate-500 tabular-nums">{src.events_count} events</span>
                      <span className={cn("font-data text-xs tabular-nums text-right", rateColor(src.verified_rate))}>
                        {src.verified_rate}%
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/sources" className="w-fit text-xs text-slate-400 hover:text-slate-200 transition-colors">
                  See all sources →
                </Link>
              </Panel>
            )}

            <div className="text-[10px] font-data tracking-[0.04em] text-slate-500 leading-relaxed pt-4 border-t border-slate-800/60">
              ⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
