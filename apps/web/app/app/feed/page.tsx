import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import SentinelMark from "@/components/watchfloor/SentinelMark";
import PostCard from "@/components/PostCard";
import type { Platform } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import { type FeedPost, getFirehosePosts, getWatchInfo } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS: Platform[] = ["telegram", "rss", "x", "wire"];
const ALL_TIERS: Array<1 | 2 | 3> = [1, 2, 3];

const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: "Telegram",
  rss:      "RSS",
  x:        "X",
  wire:     "Wire",
};

// Shared chip styling, matching the watchfloor header controls.
const CHIP = "px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase rounded-sm border transition-colors";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700";
const CHIP_ON = "border-amber-500/40 bg-amber-500/[0.08] text-amber-300";

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
  const { userId } = await auth();

  const page = await getFirehosePosts(theater.id, { platforms, tiers, before });
  const groups = groupByDay(page.posts);
  const watchInfo = userId
    ? await getWatchInfo(userId, page.posts.map((p) => p.id))
    : {};

  // Toggle helpers — clicking a chip flips its own state.
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

  return (
    <div className="feed-root min-h-screen flex flex-col bg-[#05070A] text-zinc-100 font-ui">
      {/* TOP BAR */}
      <header className="bg-zinc-950/80 border-b border-zinc-900 px-5 py-3 flex items-center justify-between gap-4 flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <SentinelMark className="text-amber-400/80 flex-none" size={24} />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-bold tracking-[0.25em] uppercase text-white whitespace-nowrap">
              Sentinel Review
            </span>
            <span className="text-zinc-700">/</span>
            <span className="text-[12px] tracking-[0.18em] uppercase text-amber-400/80 whitespace-nowrap">
              Source Feed
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none flex-wrap justify-end">
          {/* Mode toggle — Source Feed (this page) ↔ Sentinel View */}
          <div className="flex items-center rounded-sm border border-zinc-800 overflow-hidden">
            <Link
              href={`/?theater=${theater.id}`}
              className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              Sentinel View
            </Link>
            <span
              aria-current="page"
              className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase bg-amber-500/[0.12] text-amber-300 border-l border-zinc-800"
            >
              Source Feed
            </span>
          </div>

          <span className="hidden lg:inline text-zinc-500 tracking-[0.22em] uppercase text-[10px] font-data ml-1">
            Theater
          </span>
          {Object.values(THEATERS).map((t) => (
            <Link
              key={t.id}
              href={buildHref({ theater: t.id, platforms, tiers })}
              className={`${CHIP} ${theater.id === t.id ? CHIP_ON : CHIP_OFF}`}
            >
              {t.label}
            </Link>
          ))}

          <span className="w-px h-5 bg-zinc-800 mx-1" />
          {userId ? (
            <UserButton />
          ) : (
            <Link href="/sign-in" className={`${CHIP} ${CHIP_OFF}`}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* FILTER ROW */}
      <div className="border-b border-zinc-900 bg-zinc-950/40 px-5 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 flex-none">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-500 mr-1">Platform</span>
          {ALL_PLATFORMS.map((p) => (
            <Link
              key={p}
              href={buildHref({ theater: theater.id, platforms: togglePlatform(p), tiers })}
              className={`${CHIP} ${platformIsActive(p) ? CHIP_ON : CHIP_OFF}`}
            >
              {PLATFORM_LABEL[p]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-500 mr-1">Trust tier</span>
          {ALL_TIERS.map((t) => (
            <Link
              key={t}
              href={buildHref({ theater: theater.id, platforms, tiers: toggleTier(t) })}
              className={`${CHIP} ${tierIsActive(t) ? CHIP_ON : CHIP_OFF}`}
            >
              Tier {t}
            </Link>
          ))}
        </div>
      </div>

      {/* FEED CONTENT */}
      <div className="w-full max-w-3xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-1 pb-3 border-b border-zinc-900">
          <div className="text-[12px] font-data tracking-[0.18em] uppercase text-zinc-200">
            {theater.mapSubtitle}
          </div>
          <div className="text-[13px] text-zinc-400 leading-relaxed">
            The unfiltered firehose — every OSINT post ingested for this theater, before AI
            synthesis. Unverified and unprocessed; English-translated where available. Newest first.
          </div>
        </div>

        {page.posts.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-sm text-[11px] font-data tracking-[0.08em] uppercase text-zinc-500">
            No posts match these filters.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <section key={group.key} className="flex flex-col gap-3">
                  <div className="flex justify-between items-baseline pb-2 mt-3 first:mt-0 border-b border-zinc-900">
                    <span className="text-[12px] font-data tracking-[0.08em] uppercase text-zinc-200">
                      {group.label}
                    </span>
                    <span className="text-[10px] font-data tracking-[0.08em] uppercase text-zinc-500">
                      {group.posts.length} post{group.posts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {group.posts.map((post) => {
                    const info = watchInfo[post.id];
                    return (
                      <PostCard
                        key={post.id}
                        post={post}
                        watchable
                        isAuthed={!!userId}
                        initialWatched={!!info}
                        confirmed={info?.confirmed ?? false}
                        eventId={info?.event_id ?? null}
                      />
                    );
                  })}
                </section>
              ))}
            </div>

            {page.next_before && (
              <div className="flex justify-center pt-3">
                <Link
                  href={buildHref({ theater: theater.id, platforms, tiers, before: page.next_before })}
                  className="px-3.5 py-2 text-[11px] font-data tracking-[0.08em] uppercase text-zinc-300 border border-zinc-800 rounded-sm hover:text-zinc-100 hover:border-zinc-700"
                >
                  Load older posts →
                </Link>
              </div>
            )}
          </>
        )}

        <div className="text-[10px] font-data tracking-[0.04em] text-zinc-500 leading-relaxed pt-4 border-t border-zinc-900">
          ⚠ Raw, unverified source posts — not yet corroborated or geolocated by Sentinel.
          AI-translated where available; original-language text via the &ldquo;Show original&rdquo; toggle on each card.
          Sourced from open-source reporting. Not for operational use.
        </div>
      </div>
    </div>
  );
}
