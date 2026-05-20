import type { Metadata } from "next";
import MapWrapper from "@/components/MapWrapper";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import SensorStrip from "@/components/watchfloor/SensorStrip";
import KpiRail from "@/components/watchfloor/KpiRail";
import BriefPane from "@/components/watchfloor/BriefPane";
import LiveStream from "@/components/watchfloor/LiveStream";
import SectorThreat from "@/components/watchfloor/SectorThreat";
import TimeScrubber from "@/components/watchfloor/TimeScrubber";
import MapLegend from "@/components/watchfloor/MapLegend";
import TacticalReadout from "@/components/watchfloor/TacticalReadout";
import { type EventType, resolveTheater } from "@/data/placeholder";
import {
  getStats,
  getMapEvents,
  getAlerts,
  getIntensity,
  getTopSources,
  getLatestBriefing,
  resolveTimeRange,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sentinel Review — Intelligence Map",
};

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];
const WINDOW_LABELS: Record<string, string> = { "24h": "24H", "7d": "7D", "30d": "30D" };

export default async function WatchfloorPage({
  searchParams,
}: {
  searchParams: Promise<{
    theater?: string;
    window?: string;
    lat?: string;
    lng?: string;
    zoom?: string;
  }>;
}) {
  const params = await searchParams;
  const theater = resolveTheater(params.theater);
  const timeRange = resolveTimeRange(params.window);

  // Honor the map's URL-persisted position (written by MapView on pan/zoom).
  const urlLat = params.lat ? parseFloat(params.lat) : NaN;
  const urlLng = params.lng ? parseFloat(params.lng) : NaN;
  const urlZoom = params.zoom ? parseFloat(params.zoom) : NaN;
  const mapCenter: [number, number] =
    !isNaN(urlLat) && !isNaN(urlLng) ? [urlLng, urlLat] : theater.mapCenter;
  const mapZoom = !isNaN(urlZoom) ? urlZoom : theater.mapZoom;

  const [stats, mapEvents, alerts, intensity, sources, briefing] = await Promise.all([
    getStats(theater.id, timeRange),
    getMapEvents(theater.id, timeRange),
    getAlerts(theater.id, 4, timeRange),
    getIntensity(theater.id),
    getTopSources(theater.id),
    getLatestBriefing(theater.id),
  ]);

  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-[#05070A] text-zinc-100 font-ui">
      <HeaderBar theaterLabel={theater.label} windowLabel={WINDOW_LABELS[timeRange]} />
      <SensorStrip />
      <KpiRail stats={stats} />

      <div className="flex-1 min-h-0 grid grid-cols-12 grid-rows-2 gap-1.5 p-1.5">
        {/* MAP — fills cols 1-7, both rows */}
        <section className="col-span-7 row-span-2 relative bg-zinc-950/60 border border-zinc-900 rounded-sm overflow-hidden min-h-0">
          <MapWrapper
            events={mapEvents}
            center={mapCenter}
            zoom={mapZoom}
            visibleTypes={ALL_TYPES}
            palette="watch"
            showFebA
            showAOI
            showRangeRings
          />
          <MapLegend />
          <TacticalReadout />
        </section>

        <BriefPane briefing={briefing} sources={sources} theaterId={theater.id} className="col-span-5" />
        <LiveStream alerts={alerts} theaterId={theater.id} className="col-span-3" />
        <SectorThreat intensity={intensity} className="col-span-2" />
      </div>

      <TimeScrubber />
    </div>
  );
}
