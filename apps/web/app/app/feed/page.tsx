import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import SentinelMark from "@/components/watchfloor/SentinelMark";
import TheaterDropdown from "@/components/watchfloor/TheaterDropdown";
import PostCard from "@/components/ds/PostCard";
import Panel from "@/components/ds/Panel";
import FilterChip from "@/components/ds/FilterChip";
import { platformStyle } from "@/components/ds/tokens";
import type { Platform } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import { type FeedPost, getSourceFeedPosts, getWatchInfo } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS: Platform[] = ["telegram", "rss", "x", "wire", "bluesky"];
const ALL_TIERS: Array<1 | 2 | 3> = [1, 2, 3];

// Chip styling for the page header's Sign-in link. The header is intentionally
// left as-is on main (header unification is parked on another branch); the
// platform/tier filters below use the <FilterChip> design-system primitive.
const CHIP = "px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase rounded-sm border transition-colors";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700";

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

  const page = await getSourceFeedPosts(theater.id, { platforms, tiers, before });
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
    <div className="feed-root min-h-screen flex flex-col bg-slate-950 text-slate-100 font-ui">
      {/* TOP BAR — left as-is on main; header unification is parked on another branch. */}
      <header className="bg-zinc-950/80 border-b border-zinc-900 px-5 py-3 flex items-center justify-between gap-4 flex-none">
        <div className="flex items-center gap-3 min-w-0">
          <SentinelMark
            className="flex-none text-[#D99A00] drop-shadow-[0_0_4px_rgba(217,154,0,0.28)] transition-[color,filter] hover:text-[#F2B705] hover:drop-shadow-[0_0_6px_rgba(242,183,5,0.35)]"
            size={24}
          />
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
          <div className="flex items-center rounded-sm border border-zinc-800 bg-zinc-900/60 overflow-hidden">
            <Link
              href={`/?theater=${theater.id}`}
              className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
            >
              Sentinel View
            </Link>
            <span
              aria-current="page"
              className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase bg-teal-400/[0.1] text-teal-300 border-l border-zinc-800"
            >
              Source Feed
            </span>
          </div>

          <span className="hidden lg:inline text-zinc-500 tracking-[0.22em] uppercase text-[10px] font-data ml-1">
            Theater
          </span>
          <TheaterDropdown
            current={theater.label}
            options={Object.values(THEATERS).map((t) => ({
              label: t.label,
              href: buildHref({ theater: t.id, platforms, tiers }),
              active: theater.id === t.id,
            }))}
          />

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

      {/* FEED CONTENT — centered, scrolling column built from design-system primitives. */}
      <main className="w-full max-w-3xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4 flex-1">
        {/* Intro */}
        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <div className="text-[12px] font-data tracking-[0.18em] uppercase text-slate-200">
            {theater.mapSubtitle}
          </div>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            Source posts linked to published events for this theater. Unverified and unprocessed;
            English-translated where available. Newest first.
          </p>
        </div>

        {/* Filters */}
        <Panel padding="sm" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-data tracking-[0.18em] uppercase text-slate-500">
              Platform
            </span>
            {ALL_PLATFORMS.map((p) => (
              <FilterChip
                key={p}
                href={buildHref({ theater: theater.id, platforms: togglePlatform(p), tiers })}
                active={platformIsActive(p)}
              >
                {platformStyle(p).label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-data tracking-[0.18em] uppercase text-slate-500">
              Trust tier
            </span>
            {ALL_TIERS.map((t) => (
              <FilterChip
                key={t}
                href={buildHref({ theater: theater.id, platforms, tiers: toggleTier(t) })}
                active={tierIsActive(t)}
              >
                Tier {t}
              </FilterChip>
            ))}
          </div>
        </Panel>

        {page.posts.length === 0 ? (
          <Panel
            padding="md"
            className="text-center text-[11px] font-data tracking-[0.08em] uppercase text-slate-500"
          >
            No posts match these filters.
          </Panel>
        ) : (
          <>
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
                  className="px-4 py-2 rounded-lg text-[11px] font-semibold tracking-wider uppercase text-slate-300 border border-slate-700 bg-slate-900 hover:text-slate-100 hover:border-slate-600 transition-all"
                >
                  Load older posts →
                </Link>
              </div>
            )}
          </>
        )}

        <div className="text-[10px] font-data tracking-[0.04em] text-slate-500 leading-relaxed pt-4 border-t border-slate-800/60">
          ⚠ Raw, unverified source posts — not yet corroborated or geolocated by Sentinel.
          AI-translated where available; original-language text via the &ldquo;Show original&rdquo; toggle on each card.
          Sourced from open-source reporting. Not for operational use.
        </div>
      </main>
    </div>
  );
}
