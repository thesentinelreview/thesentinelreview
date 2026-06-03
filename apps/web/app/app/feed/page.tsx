import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import TimelineProvider from "@/components/watchfloor/TimelineProvider";
import TimeScrubber from "@/components/watchfloor/TimeScrubber";
import type { Platform } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import { getSourceFeedPosts, getWatchInfo } from "@/lib/queries";
import FeedPostList from "./FeedPostList";

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

// Shared chip styling, matching the watchfloor header controls.
const CHIP = "px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase rounded-sm border transition-colors";
const CHIP_OFF = "border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700";
const CHIP_ON = "border-teal-400/40 bg-teal-400/[0.08] text-teal-300";

// Scrubber span: at least 24h, expanded to cover the oldest loaded post.
const MIN_SCRUBBER_MS = 86_400_000;
const MAX_SCRUBBER_MS = 30 * 86_400_000;

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
  const { userId } = await auth();

  const page = await getSourceFeedPosts(theater.id, { platforms, tiers, before: params.before });
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

  // Theater options for the shared HeaderBar — preserve current filter state.
  const theaterOptions = Object.values(THEATERS).map((t) => ({
    label: t.label,
    href: buildHref({ theater: t.id, platforms, tiers }),
    active: theater.id === t.id,
  }));

  // Scrubber window covers the loaded page (oldest post → now), clamped to
  // 24h–30d so an empty page still gets a sane span and a deep paginate
  // doesn't make the slider unusable.
  const oldestMs = page.posts.length > 0
    ? Math.min(...page.posts.map((p) => new Date(p.posted_at).getTime()))
    : Date.now() - MIN_SCRUBBER_MS;
  const scrubberWindowMs = Math.min(
    MAX_SCRUBBER_MS,
    Math.max(MIN_SCRUBBER_MS, Date.now() - oldestMs),
  );

  return (
    <div className="feed-root min-h-screen flex flex-col bg-[#05070A] text-zinc-100 font-ui">
      <HeaderBar
        theaterLabel={theater.label}
        theaterOptions={theaterOptions}
        viewHref={`/?theater=${theater.id}`}
        mode="feed"
        isAuthed={!!userId}
      />

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

      <TimelineProvider windowMs={scrubberWindowMs}>
        {/* FEED CONTENT */}
        <div className="w-full max-w-3xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4 flex-1">
          <div className="flex flex-col gap-1 pb-3 border-b border-zinc-900">
            <div className="text-[12px] font-data tracking-[0.18em] uppercase text-zinc-200">
              {theater.mapSubtitle}
            </div>
            <div className="text-[13px] text-zinc-400 leading-relaxed">
              Source posts linked to published events for this theater. Unverified and unprocessed;
              English-translated where available. Newest first.
            </div>
          </div>

          {page.posts.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-sm text-[11px] font-data tracking-[0.08em] uppercase text-zinc-500">
              No posts match these filters.
            </div>
          ) : (
            <>
              <FeedPostList
                posts={page.posts}
                watchInfo={watchInfo}
                isAuthed={!!userId}
              />

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

        <TimeScrubber />
      </TimelineProvider>
    </div>
  );
}
