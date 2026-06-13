import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { AlertCircle } from "lucide-react";
import MapWrapper from "@/components/MapWrapper";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import ExportControl from "@/components/watchfloor/ExportControl";
import { isAdmin } from "@/lib/auth";
import { getRequestEntitlements, clampTimeRangeForFloor, tierTimeFloor } from "@/lib/entitlements";
import KpiRail from "@/components/watchfloor/KpiRail";
import BriefPane from "@/components/watchfloor/BriefPane";
import LiveStream from "@/components/watchfloor/LiveStream";
import SectorThreat from "@/components/watchfloor/SectorThreat";
import MapLegend from "@/components/watchfloor/MapLegend";
import type { EventType } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import {
  getStats,
  getMapEvents,
  getIntensity,
  getTopSources,
  getLatestBriefing,
  getKpiDeltas,
  getFusionRate,
  getMedianTTV,
  getSensorStripData,
  getSectors,
  getThreatAxes,
  resolveTimeRange,
  resolveThreatView,
  resolveFeedView,
  type TimeRange,
  type ThreatView,
  type FeedView,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sentinel Review — Intelligence Map",
};

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];
const WATCH_WINDOWS: TimeRange[] = ["24h", "7d"];
const WINDOW_LABELS: Record<TimeRange, string> = { "24h": "24H", "7d": "7D", "30d": "30D" };

const TYPE_META: { type: EventType; label: string; dot: string }[] = [
  { type: "strike", label: "Strike", dot: "bg-red-500" },
  { type: "clash", label: "Clash", dot: "bg-amber-500" },
  { type: "movement", label: "Movement", dot: "bg-blue-500" },
];

// Build a URL preserving theater + window + visible types + threat/feed views, overriding any.
function buildHref(o: {
  theater: string;
  window: TimeRange;
  types: EventType[];
  threat: ThreatView;
  feed: FeedView;
}): string {
  const p = new URLSearchParams();
  p.set("theater", o.theater);
  if (o.window !== "24h") p.set("window", o.window);
  if (o.types.length > 0 && o.types.length < ALL_TYPES.length) p.set("types", o.types.join(","));
  if (o.threat !== "sectors") p.set("threat", o.threat);
  if (o.feed !== "alerts") p.set("feed", o.feed);
  return `/?${p}`;
}

export default async function WatchfloorPage({
  searchParams,
}: {
  searchParams: Promise<{
    theater?: string;
    window?: string;
    types?: string;
    threat?: string;
    feed?: string;
    lat?: string;
    lng?: string;
    zoom?: string;
  }>;
}) {
  const [params, { userId }, admin] = await Promise.all([searchParams, auth(), isAdmin()]);
  const entitlements = await getRequestEntitlements();
  const theater = resolveTheater(params.theater);
  // The page-level window must match what the query layer actually computes
  // over: clamp the URL-requested window to the viewer's floor so the header
  // label and dropdown never claim a wider window than the data (e.g. a
  // hand-edited ?window=30d as watch renders — and labels — 7D).
  const timeRange = clampTimeRangeForFloor(
    resolveTimeRange(params.window),
    tierTimeFloor(entitlements.tier),
  ) as TimeRange;
  const threatView = resolveThreatView(params.threat);
  const feedView = resolveFeedView(params.feed);

  // Visible event types (default = all three).
  const rawTypes = params.types
    ? params.types.split(",").filter((t): t is EventType => ALL_TYPES.includes(t as EventType))
    : ALL_TYPES;
  const visibleTypes: EventType[] = rawTypes.length > 0 ? rawTypes : ALL_TYPES;

  // Honor the map's URL-persisted position (written by MapView on pan/zoom), but only when
  // lat/lng/zoom are all present and valid together. Ignore a saved zoom that's more zoomed-out
  // than the theater's default so a reload or shared link never strands the user at a world view.
  const urlLat = params.lat ? parseFloat(params.lat) : NaN;
  const urlLng = params.lng ? parseFloat(params.lng) : NaN;
  const urlZoom = params.zoom ? parseFloat(params.zoom) : NaN;
  const urlViewValid =
    !isNaN(urlLat) && !isNaN(urlLng) && !isNaN(urlZoom) &&
    urlLat >= -90 && urlLat <= 90 &&
    urlLng >= -180 && urlLng <= 180 &&
    urlZoom >= 0 && urlZoom <= 28 &&
    urlZoom >= theater.mapZoom;
  const mapCenter: [number, number] = urlViewValid ? [urlLng, urlLat] : theater.mapCenter;
  const mapZoom = urlViewValid ? urlZoom : theater.mapZoom;

  const [
    stats,
    mapEvents,
    intensity,
    sources,
    briefing,
    kpiDeltas,
    fusionPct,
    medianTtv,
    sensorData,
    sectors,
    threatAxes,
  ] = await Promise.all([
    getStats(theater.id, timeRange),
    getMapEvents(theater.id, timeRange),
    getIntensity(theater.id),
    getTopSources(theater.id),
    getLatestBriefing(theater.id),
    getKpiDeltas(theater.id, timeRange),
    getFusionRate(theater.id, timeRange),
    getMedianTTV(theater.id, timeRange),
    getSensorStripData(theater.id),
    getSectors(theater.id, timeRange),
    getThreatAxes(theater.id, timeRange),
  ]);

  // Control models (server-driven via URL params).
  const theaterOptions = Object.values(THEATERS).map((t) => ({
    label: t.label,
    active: t.id === theater.id,
    href: buildHref({ theater: t.id, window: timeRange, types: visibleTypes, threat: threatView, feed: feedView }),
  }));
  const windowOptions = WATCH_WINDOWS.map((w) => ({
    label: WINDOW_LABELS[w],
    active: w === timeRange,
    href: buildHref({ theater: theater.id, window: w, types: visibleTypes, threat: threatView, feed: feedView }),
  }));
  const legendItems = TYPE_META.map((m) => {
    const active = visibleTypes.includes(m.type);
    const next = active ? visibleTypes.filter((t) => t !== m.type) : [...visibleTypes, m.type];
    return {
      label: m.label,
      dot: m.dot,
      active,
      href: buildHref({ theater: theater.id, window: timeRange, types: next, threat: threatView, feed: feedView }),
    };
  });

  // SECTORS | AXES | INTENSITY toggle for the Sector Threat panel.
  const threatTabs = (["sectors", "axes", "intensity"] as ThreatView[]).map((v) => ({
    label: v.charAt(0).toUpperCase() + v.slice(1),
    active: threatView === v,
    href: buildHref({ theater: theater.id, window: timeRange, types: visibleTypes, threat: v, feed: feedView }),
  }));

  // ALERTS | SOURCES toggle for the LiveStream / Top Sources panel.
  const feedTabs = (["alerts", "sources"] as FeedView[]).map((v) => ({
    label: v === "alerts" ? "Active Alerts" : "Top Sources",
    active: feedView === v,
    href: buildHref({ theater: theater.id, window: timeRange, types: visibleTypes, threat: threatView, feed: v }),
  }));

  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100">
      <HeaderBar
        tier={entitlements.tier}
        theaterLabel={theater.label}
        windowLabel={WINDOW_LABELS[timeRange]}
        theaterOptions={theaterOptions}
        windowOptions={windowOptions}
        feedHref={`/app/feed?theater=${theater.id}`}
        sensorData={sensorData}
        isAuthed={!!userId}
        showAdmin={admin}
        exportControl={
          // Server-side gate (W2-2): watch and anonymous viewers never get the
          // control in the payload. The route re-checks entitlements anyway.
          entitlements.canExport ? (
            <ExportControl theater={theater.id} activeWindow={timeRange} />
          ) : undefined
        }
      />
      <KpiRail
        windowLabel={WINDOW_LABELS[timeRange]}
        deltas={kpiDeltas}
        fusionPct={fusionPct}
        medianTtvMinutes={medianTtv}
      />

      {/* Main content row — fills the viewport between KpiRail and the footer.
          Map (left) + right column (Brief on top; Active Alerts + Sector Threat
          underneath). Each right-column panel pins its own header and scrolls its
          body; the min-h-0 chain from here down is what lets those bodies scroll. */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-3 px-6 py-3">
        <div className="col-span-12 min-[1024px]:max-[1279px]:col-span-6 min-[1280px]:max-[1799px]:col-span-7 min-[1800px]:col-span-6 h-[480px] lg:h-auto lg:min-h-0 relative rounded-lg overflow-hidden border border-slate-700">
          <MapWrapper
            events={mapEvents}
            center={mapCenter}
            zoom={mapZoom}
            visibleTypes={visibleTypes}
            palette="watch"
          />
          <MapLegend items={legendItems} />
        </div>

        <div className="col-span-12 min-[1024px]:max-[1279px]:col-span-6 min-[1280px]:max-[1799px]:col-span-5 min-[1800px]:col-span-6 flex flex-col gap-3 min-h-0">
          {/* Daily Brief — compact at the top: header pinned, summary scrolls. */}
          <div className="lg:flex-1 lg:min-h-0 min-h-0">
            <BriefPane
              briefing={briefing}
              theaterId={theater.id}
              theaterLabel={theater.label}
              windowLabel={WINDOW_LABELS[timeRange]}
              eventCount={stats.events}
            />
          </div>
          {/* Active Alerts | Sector Threat — side-by-side at all ≥1024 widths so
              each panel gets a usable scroll body (~180px). At the laptop band
              the headers may wrap to two lines but the bodies remain scrollable,
              which is the functional priority. */}
          <div className="lg:flex-[1.6] lg:min-h-0 min-h-0 grid grid-cols-2 gap-3">
            <LiveStream
              events={mapEvents}
              sources={sources}
              theaterId={theater.id}
              tabs={feedTabs}
              activeTab={feedView}
            />
            <SectorThreat
              sectors={sectors}
              intensity={intensity}
              windowLabel={WINDOW_LABELS[timeRange]}
              tabs={threatTabs}
              activeTab={threatView}
              threatAxes={threatAxes}
            />
          </div>
        </div>
      </main>

      {/* Slim disclaimer strip — situational-awareness-only statement, compacted. */}
      <footer className="flex-none flex items-center gap-2.5 px-6 py-1.5 border-t border-amber-500/20 bg-amber-500/[0.04]">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-none" />
        <p className="text-[11px] text-slate-400 leading-snug">
          <strong className="font-bold uppercase tracking-wider text-amber-400">Disclaimer</strong>
          <span className="text-slate-600"> — </span>
          This platform is a <strong className="text-slate-300">situational awareness tool only</strong>. It does not
          support military targeting or operational planning. Events are algorithmically extracted and scored;
          high-impact events require human editorial review before publication. All data is derived from open-source
          intelligence and may contain inaccuracies.
        </p>
        <span className="ml-auto flex-none text-[11px] text-slate-500 whitespace-nowrap">
          <Link href="/terms" className="hover:text-amber-400">Terms</Link>
          <span className="text-slate-700"> · </span>
          <Link href="/privacy" className="hover:text-amber-400">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}
