import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import type { TheaterConfig } from "@/lib/types";
import { THEATERS, THEATER_CONTENT } from "@/data/theaters";
import { getStats } from "@/lib/queries";
import s from "./page.module.css";

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
    <div className={s.page}>
      <SiteNav />

      <div className={s.header}>
        <div className={s.title}>Theaters</div>
        <div className={s.subtitle}>
          Live OSINT conflict coverage across four active theaters.
          Updated every 30 minutes.
        </div>
      </div>

      <div className={s.grid}>
        {cards.map(({ theater, tagline, events, verified }) => (
          <Link key={theater.id} href={`/theaters/${theater.id}`} className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.cardTitle}>{theater.label}</div>
              <div className={s.cardArrow}>→</div>
            </div>
            <div className={s.cardTagline}>{tagline}</div>
            <div className={s.cardStats}>
              <div className={s.stat}>
                <div className={s.statLabel}>Events 24h</div>
                <div className={s.statValue}>{events}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Verified</div>
                <div className={s.statValue}>{verified}<span className={s.unit}>%</span></div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className={s.disclaimer}>
        ⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
      </div>
    </div>
  );
}
