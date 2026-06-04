import Link from "next/link";
import { Radio } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import FeedPostCard from "@/components/watchfloor/FeedPostCard";
import type { Platform } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import {
  type FeedPost,
  getSourceFeedPosts,
  getWatchInfo,
  getSensorStripData,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS: Platform[] = ["telegram", "rss", "x", "wire", "bluesky"];
const ALL_TIERS: Array<1 | 2 | 3> = [1, 2, 3];

const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: "Telegram",
  rss:      "RSS",
  x:        "X",
  wire:     "Wire",
  bluesky:  "Bluesky",
};

const PLATFORM_FILTER_STYLE: Record<Platform, { on: string; off: string }> = {
  rss: {
    on:  "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    off: "border-emerald-500/20 text-emerald-400/60 hover:text-emerald-300 hover:border-emerald-500/40",
  },
  x: {
    on:  "bg-sky-500/15 border-sky-500/40 text-sky-300",
    off: "border-sky-500/20 text-sky-400/60 hover:text-sky-300 hover:border-sky-500/40",
  },
  telegram: {
    on:  "bg-blue-500/15 border-blue-500/40 text-blue-300",
    off: "border-blue-500/20 text-blue-400/60 hover:text-blue-300 hover:border-blue-500/40",
  },
  bluesky: {
    on:  "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
    off: "border-cyan-500/20 text-cyan-400/60 hover:text-cyan-300 hover:border-cyan-500/40",
  },
  wire: {
    on:  "bg-amber-500/15 border-amber-500/40 text-amber-300",
    off: "border-amber-500/20 text-amber-400/60 hover:text-amber-300 hover:border-amber-500/40",
  },
};

const TIER_FILTER_STYLE: Record<1 | 2 | 3, { on: string; off: string }> = {
  1: {
    on:  "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    off: "border-emerald-500/20 text-emerald-400/60 hover:text-emerald-300 hover:border-emerald-500/40",
  },
  2: {
    on:  "bg-amber-500/15 border-amber-500/40 text-amber-300",
    off: "border-amber-500/20 text-amber-400/60 hover:text-amber-300 hover:border-amber-500/40",
  },
  3: {
    on:  "bg-slate-700/40 border-slate-500/40 text-slate-200",
    off: "border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600",
  },
};

function parsePlatforms(raw: string | undefined): Platform[] {
  if (!raw) return [];
  return raw.split(",")
    .filter((p): p is Platform => (ALL_PLATFORMS as string[]).includes(p));
}

function parseTiers(raw: string | undefined): Array<1 | 2 | 3> {
  if (!raw) return [];
  return raw.split(",")
    .map((t) => parseInt(t, 10))
    .filter((t): t is 1 | 2 | 3 => t === 1 || t === 2 || t === 3);
}

function buildHref(opts: {
  theater:   string;
  platforms: Platform[];
  tiers:     Array<1 | 2 | 3>;
  before?:   string | null;
}): string {
  const p = new URLSearchParams();
  p.set("theater", opts.theater);
  if (opts.platforms.length > 0 && opts.platforms.length < ALL_PLATFORMS.length) {
    p.set("platforms", opts.platforms.join(","));
  }
  if (opts.tiers.length > 0 && opts.tiers.length < ALL_TIERS.length) {
    p.set("tiers", opts.tiers.join(","));
  }
  if (opts.before) p.set("before", opts.before);
  return `/app/feed?${p}`;
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "UTC" });
}

function dayLabel(iso: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "UTC" });
  const dk = dayKey(iso);
  if (dk === today) return "Today";
  if (dk === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day:     "2-digit",
    month:   "short",
    year:    "numeric",
    timeZone: "UTC",
  });
}

interface DayGroup {
  key:   string;
  label: string;
  posts: FeedPost[];
}

function groupByDay(posts: FeedPost[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const post of posts) {
    const k = dayKey(post.posted_at);
    if (!current || current.key !== k) {
      current = { key: k, label: dayLabel(post.posted_at), posts: [] };
      groups.push(current);
    }
    current.posts.push(post);
  }
  return groups;
}

const EMPTY_SENSOR_DATA = {
  platforms: { tg: 0, x: 0, rss: 0, gdelt: 0, bsky: 0 },
  latency_seconds: null as number | null,
  tracks: 0,
};
const EMPTY_PAGE: { posts: FeedPost[]; next_before: string | null } = {
  posts: [],
  next_before: null,
};

export default async function SourceFeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    theater?:   string;
    platforms?: string;
    tiers?:     string;
    before?:    string;
  }>;
}) {
  const params  = await searchParams;
  const theater = resolveTheater(params.theater);
  const platforms = parsePlatforms(params.platforms);
  const tiers     = parseTiers(params.tiers);
  const before    = params.before;

  // Belt-and-braces: every server call below is wrapped so a thrown query,
  // auth failure, or missing env var degrades the feed to an honest empty
  // state instead of 500'ing. The underlying queries already try/catch their
  // pg errors, but we guard here too to cover auth() and any other surprise.
  let userId: string | null = null;
  let page = EMPTY_PAGE;
  let sensorData = EMPTY_SENSOR_DATA;
  let watchInfo: Record<string, { confirmed: boolean; event_id: string | null }> = {};
  let dataUnavailable = false;

  try {
    const authResult = await auth();
    userId = authResult.userId;
  } catch (err) {
    console.error("[/app/feed] auth() failed:", err);
    dataUnavailable = true;
  }

  try {
    const [feedPage, sensors] = await Promise.all([
      getSourceFeedPosts(theater.id, { platforms, tiers, before }),
      getSensorStripData(theater.id),
    ]);
    page = feedPage;
    sensorData = sensors;
  } catch (err) {
    console.error("[/app/feed] feed/sensor fetch failed:", err);
    dataUnavailable = true;
  }

  if (userId && page.posts.length > 0) {
    try {
      watchInfo = await getWatchInfo(userId, page.posts.map((p) => p.id));
    } catch (err) {
      console.error("[/app/feed] watch info fetch failed:", err);
    }
  }

  const groups = groupByDay(page.posts);

  // Distinct sources represented in the loaded page — a real signal we can show
  // without faking a global "active sources" count.
  const sourcesInPage = new Set(page.posts.map((p) => p.source_handle)).size;

  function togglePlatform(p: Platform): Platform[] {
    const active = platforms.length === 0 ? [...ALL_PLATFORMS] : platforms;
    return active.includes(p) ? active.filter((x) => x !== p) : [...active, p];
  }
  function toggleTier(t: 1 | 2 | 3): Array<1 | 2 | 3> {
    const active = tiers.length === 0 ? [...ALL_TIERS] : tiers;
    return active.includes(t) ? active.filter((x) => x !== t) : [...active, t];
  }

  const platformIsActive = (p: Platform) =>
    platforms.length === 0 ? true : platforms.includes(p);
  const tierIsActive = (t: 1 | 2 | 3) =>
    tiers.length === 0 ? true : tiers.includes(t);

  const theaterOptions = Object.values(THEATERS).map((t) => ({
    label: t.label,
    active: t.id === theater.id,
    href: buildHref({ theater: t.id, platforms, tiers }),
  }));

  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100">
      <HeaderBar
        theaterLabel={theater.label}
        theaterOptions={theaterOptions}
        feedHref="/app/feed"
        watchHref={`/?theater=${theater.id}`}
        currentView="feed"
        sensorData={sensorData}
        isAuthed={!!userId}
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-6">
          {/* Page header card */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <Radio className="w-5 h-5 text-blue-400" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">Source Feed</h2>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-300 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-widest">
                  {theater.mapSubtitle}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {sourcesInPage > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs">
                    <span className="text-slate-500 uppercase tracking-wider font-semibold">Sources</span>
                    <span className="text-slate-200 font-mono font-bold">{sourcesInPage}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs">
                  <span className="text-slate-500 uppercase tracking-wider font-semibold">Posts</span>
                  <span className="text-slate-200 font-mono font-bold">{page.posts.length}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              Source posts linked to published events for this theater. Unverified and unprocessed;
              English-translated where available. Newest first.
              <span className="text-amber-400 font-semibold ml-1">Not for operational use.</span>
            </div>
          </section>

          {/* Filter card */}
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-4 shadow-xl">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mr-1">
                  Platform
                </span>
                {ALL_PLATFORMS.map((p) => {
                  const active = platformIsActive(p);
                  const style = PLATFORM_FILTER_STYLE[p];
                  return (
                    <Link
                      key={p}
                      href={buildHref({ theater: theater.id, platforms: togglePlatform(p), tiers })}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded border transition-colors ${
                        active ? style.on : style.off
                      }`}
                    >
                      {PLATFORM_LABEL[p]}
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mr-1">
                  Trust tier
                </span>
                {ALL_TIERS.map((t) => {
                  const active = tierIsActive(t);
                  const style = TIER_FILTER_STYLE[t];
                  return (
                    <Link
                      key={t}
                      href={buildHref({ theater: theater.id, platforms, tiers: toggleTier(t) })}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded border transition-colors ${
                        active ? style.on : style.off
                      }`}
                    >
                      Tier {t}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Feed card */}
          {dataUnavailable ? (
            <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-amber-500/30 rounded-xl p-10 shadow-xl text-center">
              <div className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-2">
                Feed temporarily unavailable
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Could not load source posts for this theater. The dashboard map and briefing remain
                available; the feed will return once the upstream issue is resolved.
              </p>
            </section>
          ) : page.posts.length === 0 ? (
            <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-10 shadow-xl text-center">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                No posts match these filters.
              </span>
            </section>
          ) : (
            <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl">
              {groups.map((group, gi) => (
                <div key={group.key} className={gi > 0 ? "border-t border-slate-800/60" : ""}>
                  <div className="flex items-baseline justify-between gap-3 px-6 py-3 border-b border-slate-800/60">
                    <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                      {group.label}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                      {group.posts.length} post{group.posts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-800/60 px-6">
                    {group.posts.map((post, pi) => {
                      const info = watchInfo[post.id];
                      const isNewest = gi === 0 && pi === 0 && !before;
                      return (
                        <FeedPostCard
                          key={post.id}
                          post={post}
                          isNewest={isNewest}
                          isAuthed={!!userId}
                          initialWatched={!!info}
                          confirmed={info?.confirmed ?? false}
                          eventId={info?.event_id ?? null}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {page.next_before && (
                <div className="flex justify-center px-6 py-5 border-t border-slate-800/60">
                  <Link
                    href={buildHref({ theater: theater.id, platforms, tiers, before: page.next_before })}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 transition-colors"
                  >
                    Load older posts →
                  </Link>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
