import type { Metadata } from "next";
import Header from "@/components/redesign/Header";
import DashboardMapWrapper from "@/components/redesign/DashboardMapWrapper";
import AtAGlance from "@/components/redesign/AtAGlance";
import IntensityChart, { type IntensityDayCount } from "@/components/redesign/IntensityChart";
import ActiveAlerts from "@/components/redesign/ActiveAlerts";
import TopSources from "@/components/redesign/TopSources";
import DailyBriefing, { type ConfidenceCounts } from "@/components/redesign/DailyBriefing";
import FooterDisclaimer from "@/components/redesign/FooterDisclaimer";
import { resolveTheater } from "@/data/theaters";
import {
  getStats,
  getMapEvents,
  getTopSources,
  getLatestBriefing,
  getKpiSparklines,
  resolveTimeRange,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sentinel Review — Intelligence Dashboard (v2)",
};

const WINDOW_LABELS: Record<string, string> = { "24h": "Past 24h", "7d": "Past 7 Days", "30d": "Past 30 Days" };

// 7 daily ISO date strings, oldest → newest, in UTC. Aligns with how
// getKpiSparklines emits its `events` buckets so the labels match the bars.
function lastSevenDates(): string[] {
  const out: string[] = [];
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 6; i >= 0; i--) {
    out.push(new Date(todayUtc - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export default async function V2Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ theater?: string; window?: string }>;
}) {
  const params = await searchParams;
  const theater = resolveTheater(params.theater);
  const timeRange = resolveTimeRange(params.window);

  const [stats, mapEvents, sources, briefing, sparks] = await Promise.all([
    getStats(theater.id, timeRange),
    getMapEvents(theater.id, timeRange),
    getTopSources(theater.id, 6),
    getLatestBriefing(theater.id),
    getKpiSparklines(theater.id, "7d"),
  ]);

  // Confidence rollup for the briefing footer — counted off the events visible
  // in the current window, since briefings don't carry their own breakdown.
  const confidence: ConfidenceCounts = {
    verified: mapEvents.filter((e) => e.confidence === "verified").length,
    partial: mapEvents.filter((e) => e.confidence === "partial").length,
    unconfirmed: mapEvents.filter((e) => e.confidence === "unconfirmed").length,
  };

  const dates = lastSevenDates();
  // getKpiSparklines emits exactly 7 buckets for the 7d window. Defensive zip in
  // case the count ever drifts.
  const intensity: IntensityDayCount[] = dates.map((date, i) => ({
    date,
    count: sparks.events[i] ?? 0,
  }));

  const lastUpdatedAt = mapEvents[0]?.occurred_at ?? null;

  return (
    <div className="dashboard-v2-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <Header theaterSubtitle={theater.mapSubtitle} lastUpdatedAt={lastUpdatedAt} />

      <main className="p-6 max-w-[1800px] mx-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 h-[550px]">
            <DashboardMapWrapper
              events={mapEvents}
              center={theater.mapCenter}
              zoom={theater.mapZoom}
              theaterId={theater.id}
            />
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <AtAGlance
              totalEvents={stats.events}
              strikeCount={stats.strikes}
              verifiedPercentage={stats.verified_pct}
              weeklyTrend={stats.vs_7d_avg_pct}
              windowLabel={WINDOW_LABELS[timeRange]}
            />
            <IntensityChart data={intensity} />
          </div>

          <div className="col-span-12 lg:col-span-4">
            <ActiveAlerts events={mapEvents} theaterId={theater.id} />
          </div>

          <div className="col-span-12 lg:col-span-4">
            <TopSources sources={sources} />
          </div>

          <div className="col-span-12">
            <DailyBriefing
              briefing={briefing}
              confidence={confidence}
              theaterId={theater.id}
              theaterLabel={theater.label}
            />
          </div>
        </div>

        <FooterDisclaimer />
      </main>
    </div>
  );
}
