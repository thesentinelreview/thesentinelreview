import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import PostCard from "@/components/PostCard";
import { THEATERS, type TheaterKey } from "@/data/placeholder";
import { THEATER_CONTENT } from "@/data/theaters";
import {
  getStats,
  getTopSources,
  getLatestBriefing,
  getSourceFeedPosts,
  type FeedPost,
} from "@/lib/queries";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

const VALID: TheaterKey[] = ["ukraine", "iran", "sudan", "myanmar"];

function isTheaterKey(x: string): x is TheaterKey {
  return (VALID as string[]).includes(x);
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

// ---------------------------------------------------------------------------
// Day-grouping helpers (same logic as /app/feed)
// ---------------------------------------------------------------------------

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "UTC" });
}

function dayLabel(iso: string): string {
  const today     = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "UTC" });
  const dk = dayKey(iso);
  if (dk === today) return "Today";
  if (dk === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday:  "short",
    day:      "2-digit",
    month:    "short",
    year:     "numeric",
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TheaterDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ theater: string }>;
  searchParams: Promise<{ view?: string; before?: string }>;
}) {
  const { theater }         = await params;
  const { view: rawView, before } = await searchParams;

  if (!isTheaterKey(theater)) notFound();

  const view    = rawView === "ai" ? "ai" : "sources";
  const cfg     = THEATERS[theater];
  const content = THEATER_CONTENT[theater];

  // Branch data fetching by mode
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
    <div className={s.page}>
      <SiteNav />

      {/* Header */}
      <div className={s.header}>
        <div className={s.eyebrow}>
          <Link href="/theaters" className={s.eyebrowLink}>← All theaters</Link>
        </div>
        <h1 className={s.title}>{cfg.label} theater</h1>
        <div className={s.subtitle}>{cfg.mapSubtitle}</div>
        <div className={s.meta}>Coverage since {content.since}</div>
      </div>

      {/* Mode toggle */}
      <div className={s.modeBar}>
        <span className={s.modeLabel}>View</span>
        <Link
          href={`/theaters/${theater}?view=sources`}
          className={`${s.modeChip} ${view === "sources" ? s.modeChipActive : ""}`}
        >
          Source feed
        </Link>
        <Link
          href={`/theaters/${theater}?view=ai`}
          className={`${s.modeChip} ${view === "ai" ? s.modeChipActive : ""}`}
        >
          AI verification
        </Link>
      </div>

      {/* ── SOURCE FEED MODE ─────────────────────────────────────────── */}
      {view === "sources" && (
        <>
          {feedPage!.posts.length === 0 ? (
            <div className={s.feedEmpty}>
              No source posts yet for this theater — run the backfill workflow to populate.
            </div>
          ) : (
            <div className={s.feed}>
              {groups.map((group) => (
                <section key={group.key} className={s.daySection}>
                  <div className={s.daySep}>
                    <span className={s.daySepLabel}>{group.label}</span>
                    <span className={s.daySepCount}>
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
            <div className={s.feedMore}>
              <Link
                href={`/theaters/${theater}?view=sources&before=${feedPage!.next_before}`}
                className={s.feedMoreLink}
              >
                Load older posts →
              </Link>
            </div>
          )}

          <div className={s.disclaimer}>
            ⚠ AI-translated content. Original-language text available via the &ldquo;Show original&rdquo; toggle on each card.
            Events sourced from open-source reporting; locations and details unverified. Not for operational use.
          </div>
        </>
      )}

      {/* ── AI VERIFICATION MODE ─────────────────────────────────────── */}
      {view === "ai" && (
        <>
          {/* Live stats */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionTitle}>Live activity</div>
            </div>
            <div className={s.statsRow}>
              <div className={s.stat}>
                <div className={s.statLabel}>Events 24h</div>
                <div className={s.statValue}>{stats24h!.events}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Events 7d</div>
                <div className={s.statValue}>{stats7d!.events}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Events 30d</div>
                <div className={s.statValue}>{stats30d!.events}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Verified (7d)</div>
                <div className={s.statValue}>
                  {stats7d!.verified_pct}<span className={s.unit}>%</span>
                </div>
              </div>
            </div>
            <div className={s.ctaRow}>
              <Link href={`/?theater=${theater}`} className={s.cta}>View live map →</Link>
              <Link href={`/app/feed?theater=${theater}`} className={s.cta}>Browse Source Feed →</Link>
              {briefing && (
                <Link href={`/briefing/${briefing.id}?theater=${theater}`} className={s.cta}>
                  Read latest briefing →
                </Link>
              )}
            </div>
          </div>

          {/* Context */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionTitle}>About this theater</div>
            </div>
            <div className={s.prose}>
              {content.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>

          {/* Key actors */}
          <div className={s.section}>
            <div className={s.sectionHeader}>
              <div className={s.sectionTitle}>Key actors</div>
            </div>
            <ul className={s.actorList}>
              {content.keyActors.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>

          {/* Top sources */}
          {sources!.length > 0 && (
            <div className={s.section}>
              <div className={s.sectionHeader}>
                <div className={s.sectionTitle}>Top sources (30-day verification rate)</div>
              </div>
              <div className={s.sourcesList}>
                {sources!.map((src) => (
                  <div key={src.rank} className={s.sourceRow}>
                    <span className={s.sourceRank}>{String(src.rank).padStart(2, "0")}</span>
                    <span className={s.sourceName}>{src.display_name}</span>
                    <span className={s.sourceCount}>{src.events_count} events</span>
                    <span className={s.sourceRate}>{src.verified_rate}%</span>
                  </div>
                ))}
              </div>
              <div className={s.sourcesFooter}>
                <Link href="/sources" className={s.sourcesFooterLink}>See all sources →</Link>
              </div>
            </div>
          )}

          <div className={s.disclaimer}>
            ⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
          </div>
        </>
      )}
    </div>
  );
}
