import SiteNav from "@/components/SiteNav";
import type { SourceDetail } from "@/lib/types";
import { getAllSources } from "@/lib/queries";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (!d.getTime()) return "—";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 0) return "—";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function platformLabel(p: string): string {
  if (p === "x") return "X";
  if (p === "telegram") return "TG";
  if (p === "rss") return "RSS";
  return "WIRE";
}

function platClass(p: string, s: Record<string, string>): string {
  if (p === "x") return s.platX;
  if (p === "telegram") return s.platTelegram;
  if (p === "rss") return s.platRss;
  return s.platWire;
}

function tierClass(t: number, s: Record<string, string>): string {
  if (t === 1) return s.tier1;
  if (t === 2) return s.tier2;
  return s.tier3;
}

function tierLabel(t: number): string {
  if (t === 1) return "High trust";
  if (t === 2) return "Med trust";
  return "Low trust";
}

function rateClass(r: number, s: Record<string, string>): string {
  if (r >= 80) return s.rateHigh;
  if (r >= 60) return s.rateMid;
  return s.rateLow;
}

function rateFillClass(r: number, s: Record<string, string>): string {
  if (r >= 80) return s.rateFillHigh;
  if (r >= 60) return s.rateFillMid;
  return s.rateFillLow;
}

export default async function SourcesPage() {
  const allSources = await getAllSources();
  const totalSources = allSources.length;
  const avgRate = totalSources === 0
    ? 0
    : Math.round(allSources.reduce((a, b) => a + b.verified_rate, 0) / totalSources);

  return (
    <div className={s.page}>
      <SiteNav />

      <div className={s.header}>
        <div>
          <div className={s.title}>Source reliability</div>
          <div className={s.subtitle}>
            {totalSources} active sources · {avgRate}% average verification rate
          </div>
        </div>
        <div className={s.headerMeta}>
          Rolling 30-day stats<br />Updated hourly
        </div>
      </div>

      <div className={s.panel}>
        <div className={s.tableHeader}>
          <span>#</span>
          <span>Source</span>
          <span>Today</span>
          <span>30-day</span>
          <span>Verified rate</span>
          <span style={{ textAlign: "right" }}>Last seen</span>
        </div>
        {allSources.map((src: SourceDetail) => (
          <div key={src.handle} className={s.sourceRow}>
            <div className={s.rank}>{String(src.rank).padStart(2, "0")}</div>

            <div className={s.identity}>
              <div className={s.handleRow}>
                <span className={s.handle}>{src.display_name}</span>
                <span className={`${s.platformBadge} ${platClass(src.platform, s)}`}>
                  {platformLabel(src.platform)}
                </span>
                <span className={`${s.tierBadge} ${tierClass(src.trust_tier, s)}`}>
                  {tierLabel(src.trust_tier)}
                </span>
              </div>
              <div className={s.notes}>{src.notes}</div>
            </div>

            <div>
              <div className={s.eventsCount}>{src.events_count}</div>
              <div className={s.events30d}>today</div>
            </div>

            <div>
              <div className={s.eventsCount}>{src.events_30d}</div>
              <div className={s.events30d}>30-day</div>
            </div>

            <div className={s.rateWrap}>
              <div className={s.rateBar}>
                <div
                  className={`${s.rateFill} ${rateFillClass(src.verified_rate, s)}`}
                  style={{ width: `${src.verified_rate}%` }}
                />
              </div>
              <span className={`${s.rateLabel} ${rateClass(src.verified_rate, s)}`}>
                {src.verified_rate}%
              </span>
            </div>

            <div className={s.lastSeen}>{fmtRelativeDate(src.last_event_at)}</div>
          </div>
        ))}
      </div>

      <div className={s.footerNote}>
        <strong>Verification rate</strong> measures the percentage of events from a given source that reached{" "}
        <em>verified</em> or <em>partial</em> confidence status over the rolling 30-day window. A low rate does
        not mean a source is unreliable — high-volume milblog channels produce many unverified reports that are
        later corroborated. <strong>Trust tier</strong> reflects editorial weighting, not verification rate alone.
        See <a href="/methodology" style={{ color: "var(--text)", borderBottom: "1px solid var(--border-strong)", textDecoration: "none" }}>/methodology</a> for
        the full rubric.
      </div>
    </div>
  );
}
