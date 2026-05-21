import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import s from "@/app/page.module.css";
import f from "./feed.module.css";
import PostCard from "@/components/PostCard";
import { type Platform, resolveTheater, THEATERS } from "@/data/placeholder";
import { type FeedPost, getFirehosePosts } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS: Platform[] = ["telegram", "rss", "x", "wire"];
const ALL_TIERS: Array<1 | 2 | 3> = [1, 2, 3];

const PLATFORM_LABEL: Record<Platform, string> = {
  telegram: "Telegram",
  rss:      "RSS",
  x:        "X",
  wire:     "Wire",
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
    <div className={s.app}>
      {/* TOP BAR */}
      <div className={s.topbar}>
        <div className={s.brand}>
          <div className={s.brandLogo} />
          <div className={s.brandName}>Sentinel Review</div>
          <div className={s.brandDivider}>/</div>
          <div className={s.brandSection}>Source Feed</div>
        </div>
        <div className={s.filters}>
          <span className={s.filterLabel}>Mode</span>
          <Link
            href={`/?theater=${theater.id}`}
            className={s.filterChip}
          >
            Sentinel View
          </Link>
          <Link
            href={buildHref({ theater: theater.id, platforms, tiers })}
            className={`${s.filterChip} ${s.filterChipActive}`}
          >
            Source Feed
          </Link>
          <span className={s.filterLabel} style={{ marginLeft: 6 }}>Theater</span>
          {Object.values(THEATERS).map((t) => (
            <Link
              key={t.id}
              href={buildHref({ theater: t.id, platforms, tiers })}
              className={`${s.filterChip} ${theater.id === t.id ? s.filterChipActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
          <div style={{ marginLeft: 8 }}>
            {userId ? (
              <UserButton />
            ) : (
              <Link href="/sign-in" className={s.filterChip}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* FILTER ROW */}
      <div className={f.filterBar}>
        <div className={f.filterGroup}>
          <span className={f.filterGroupLabel}>Platform</span>
          {ALL_PLATFORMS.map((p) => (
            <Link
              key={p}
              href={buildHref({
                theater:   theater.id,
                platforms: togglePlatform(p),
                tiers,
              })}
              className={`${f.chip} ${platformIsActive(p) ? f.chipActive : ""}`}
            >
              {PLATFORM_LABEL[p]}
            </Link>
          ))}
        </div>
        <div className={f.filterGroup}>
          <span className={f.filterGroupLabel}>Trust tier</span>
          {ALL_TIERS.map((t) => (
            <Link
              key={t}
              href={buildHref({
                theater:   theater.id,
                platforms,
                tiers:     toggleTier(t),
              })}
              className={`${f.chip} ${tierIsActive(t) ? f.chipActive : ""}`}
            >
              Tier {t}
            </Link>
          ))}
        </div>
      </div>

      {/* FEED CONTENT */}
      <div className={f.container}>
        <div className={f.intro}>
          <div className={f.introTitle}>{theater.mapSubtitle}</div>
          <div className={f.introMeta}>
            The unfiltered firehose — every OSINT post ingested for this theater, before AI
            synthesis. Unverified and unprocessed; English-translated where available. Newest first.
          </div>
        </div>

        {page.posts.length === 0 ? (
          <div className={f.empty}>
            No posts match these filters.
          </div>
        ) : (
          <>
            <div className={f.feed}>
              {groups.map((group) => (
                <section key={group.key} className={f.daySection}>
                  <div className={f.daySep}>
                    <span className={f.daySepLabel}>{group.label}</span>
                    <span className={f.daySepCount}>
                      {group.posts.length} post{group.posts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {group.posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </section>
              ))}
            </div>

            {page.next_before && (
              <div className={f.more}>
                <Link
                  href={buildHref({
                    theater:   theater.id,
                    platforms,
                    tiers,
                    before:    page.next_before,
                  })}
                  className={f.moreLink}
                >
                  Load older posts →
                </Link>
              </div>
            )}
          </>
        )}

        <div className={f.disclaimer}>
          ⚠ Raw, unverified source posts — not yet corroborated or geolocated by Sentinel.
          AI-translated where available; original-language text via the &ldquo;Show original&rdquo; toggle on each card.
          Sourced from open-source reporting. Not for operational use.
        </div>
      </div>
    </div>
  );
}
