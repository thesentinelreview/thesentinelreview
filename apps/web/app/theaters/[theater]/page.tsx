import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import { THEATERS, type TheaterKey } from "@/data/placeholder";
import { THEATER_CONTENT } from "@/data/theaters";
import { getStats, getTopSources, getLatestBriefing } from "@/lib/queries";
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

export default async function TheaterDetailPage({
  params,
}: {
  params: Promise<{ theater: string }>;
}) {
  const { theater } = await params;
  if (!isTheaterKey(theater)) notFound();

  const cfg     = THEATERS[theater];
  const content = THEATER_CONTENT[theater];

  const [stats24h, stats7d, stats30d, sources, briefing] = await Promise.all([
    getStats(theater, "24h"),
    getStats(theater, "7d"),
    getStats(theater, "30d"),
    getTopSources(theater, 5),
    getLatestBriefing(theater),
  ]);

  return (
    <div className={s.page}>
      <SiteNav />

      <div className={s.header}>
        <div className={s.eyebrow}>
          <Link href="/theaters" className={s.eyebrowLink}>← All theaters</Link>
        </div>
        <h1 className={s.title}>{cfg.label} theater</h1>
        <div className={s.subtitle}>{cfg.mapSubtitle}</div>
        <div className={s.meta}>Coverage since {content.since}</div>
      </div>

      {/* Live stats */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Live activity</div>
        </div>
        <div className={s.statsRow}>
          <div className={s.stat}>
            <div className={s.statLabel}>Events 24h</div>
            <div className={s.statValue}>{stats24h.events}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>Events 7d</div>
            <div className={s.statValue}>{stats7d.events}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>Events 30d</div>
            <div className={s.statValue}>{stats30d.events}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>Verified (7d)</div>
            <div className={s.statValue}>
              {stats7d.verified_pct}<span className={s.unit}>%</span>
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
      {sources.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div className={s.sectionTitle}>Top sources (30-day verification rate)</div>
          </div>
          <div className={s.sourcesList}>
            {sources.map((src) => (
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
    </div>
  );
}
