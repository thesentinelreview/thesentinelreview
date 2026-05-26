import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import MapWrapper from "@/components/MapWrapper";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import SensorStrip from "@/components/watchfloor/SensorStrip";
import KpiRail from "@/components/watchfloor/KpiRail";
import BriefPane from "@/components/watchfloor/BriefPane";
import LiveStream from "@/components/watchfloor/LiveStream";
import SectorThreat from "@/components/watchfloor/SectorThreat";
import TimeScrubber from "@/components/watchfloor/TimeScrubber";
import MapLegend from "@/components/watchfloor/MapLegend";
import TimelineProvider from "@/components/watchfloor/TimelineProvider";
import type { EventType } from "@/lib/types";
import { resolveTheater, THEATERS } from "@/data/theaters";
import {
  getStats,
  getMapEvents,
  getAlerts,
  getIntensity,
  getSectors,
  getTopSources,
  getLatestBriefing,
  getFusionRate,
  getMedianTTV,
  getSensorStripData,
  resolveTimeRange,
  type TimeRange,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sentinel Review — Intelligence Map",
};

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];
const WATCH_WINDOWS: TimeRange[] = ["24h", "7d"];
const WINDOW_LABELS: Record<TimeRange, string> = { "24h": "24H", "7d": "7D", "30d": "30D" };
const WINDOW_MS: Record<TimeRange, number> = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

const TYPE_META: { type: EventType; label: string; dot: string }[] = [
  { type: "strike", label: "Strike", dot: "bg-red-500" },
  { type: "clash", label: "Contact", dot: "bg-amber-500" },
  { type: "movement", label: "Movement", dot: "bg-cyan-400" },
];

// Build a URL preserving theater + window + visible types, overriding any.
function buildHref(o: { theater: string; window: TimeRange; types: EventType[] }): string {
  const p = new URLSearchParams();
  p.set("theater", o.theater);
  if (o.window !== "24h") p.set("window", o.window);
  if (o.types.length > 0 && o.types.length < ALL_TYPES.length) p.set("types", o.types.join(","));
  return `/?${p}`;
}

export default async function WatchfloorPage({
  searchParams,
}: {
  searchParams: Promise<{
    theater?: string;
    window?: string;
    types?: string;
    lat?: string;
    lng?: string;
    zoom?: string;
  }>;
}) {
  const [params, { userId }] = await Promise.all([searchParams, auth()]);
  const theater = resolveTheater(params.theater);
  const timeRange = resolveTimeRange(params.window);

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

  const [stats, mapEvents, alerts, intensity, sources, briefing, sectors, fusionPct, medianTtv, sensorData] = await Promise.all([
    getStats(theater.id, timeRange),
    getMapEvents(theater.id, timeRange),
    // Live Event Stream is always the last 24h, independent of the dashboard window.
    getAlerts(theater.id, null, "24h"),
    getIntensity(theater.id),
    getTopSources(theater.id),
    getLatestBriefing(theater.id),
    getSectors(theater.id),
    getFusionRate(theater.id, timeRange),
    getMedianTTV(theater.id, timeRange),
    getSensorStripData(theater.id),
  ]);

  // Control models (server-driven via URL params).
  const theaterOptions = Object.values(THEATERS).map((t) => ({
    label: t.label,
    active: t.id === theater.id,
    href: buildHref({ theater: t.id, window: timeRange, types: visibleTypes }),
  }));
  const windowOptions = WATCH_WINDOWS.map((w) => ({
    label: WINDOW_LABELS[w],
    active: w === timeRange,
    href: buildHref({ theater: theater.id, window: w, types: visibleTypes }),
  }));
  const legendItems = TYPE_META.map((m) => {
    const active = visibleTypes.includes(m.type);
    const next = active ? visibleTypes.filter((t) => t !== m.type) : [...visibleTypes, m.type];
    return {
      label: m.label,
      dot: m.dot,
      active,
      href: buildHref({ theater: theater.id, window: timeRange, types: next }),
    };
  });

  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-[#05070A] text-zinc-100 font-ui">
      <HeaderBar
        theaterLabel={theater.label}
        windowLabel={WINDOW_LABELS[timeRange]}
        theaterOptions={theaterOptions}
        windowOptions={windowOptions}
        feedHref={`/app/feed?theater=${theater.id}`}
        isAuthed={!!userId}
      />
      <SensorStrip data={sensorData} />
      <KpiRail stats={stats} windowLabel={WINDOW_LABELS[timeRange]} fusionPct={fusionPct} medianTtvMinutes={medianTtv} />

      <TimelineProvider windowMs={WINDOW_MS[timeRange]}>
        <div className="flex-1 min-w-0 min-h-0 overflow-x-hidden overflow-y-auto md:overflow-hidden flex flex-col md:grid md:grid-cols-12 md:grid-rows-2 gap-1.5 p-1.5">
          {/* MAP — fills cols 1-7, both rows on desktop; fixed height on mobile */}
          <section className="h-[42vh] flex-none min-w-0 md:h-auto md:col-span-7 md:row-span-2 relative bg-zinc-950/60 border border-zinc-900 rounded-sm overflow-hidden">
            <MapWrapper
              events={mapEvents}
              center={mapCenter}
              zoom={mapZoom}
              visibleTypes={visibleTypes}
              palette="watch"
            />
            <MapLegend items={legendItems} />
          </section>

          <BriefPane briefing={briefing} sources={sources} theaterId={theater.id} className="flex-none min-w-0 md:col-span-5" />
          <LiveStream alerts={alerts} theaterId={theater.id} className="flex-none min-w-0 max-h-[280px] md:max-h-none md:col-span-3" />
          <SectorThreat sectors={sectors} intensity={intensity} className="flex-none min-w-0 md:col-span-2" />
        </div>

        <TimeScrubber />
      </TimelineProvider>
    </div>
  );
}
