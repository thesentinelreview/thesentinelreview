import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AlertCircle } from "lucide-react";
import MapWrapper from "@/components/MapWrapper";
import HeaderBar from "@/components/watchfloor/HeaderBar";
import KpiRail from "@/components/watchfloor/KpiRail";
import BriefPane from "@/components/watchfloor/BriefPane";
import LiveStream from "@/components/watchfloor/LiveStream";
import IntensityBars from "@/components/watchfloor/IntensityBars";
import TopSources from "@/components/watchfloor/TopSources";
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

const TYPE_META: { type: EventType; label: string; dot: string }[] = [
  { type: "strike", label: "Strike", dot: "bg-red-500" },
  { type: "clash", label: "Clash", dot: "bg-amber-500" },
  { type: "movement", label: "Movement", dot: "bg-blue-500" },
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

  const [stats, mapEvents, intensity, sources, briefing, kpiDeltas] = await Promise.all([
    getStats(theater.id, timeRange),
    getMapEvents(theater.id, timeRange),
    getIntensity(theater.id),
    getTopSources(theater.id),
    getLatestBriefing(theater.id),
    getKpiDeltas(theater.id, timeRange),
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
    <div className="watchfloor-root min-h-screen bg-slate-950 text-slate-100">
      <HeaderBar
        theaterLabel={theater.label}
        windowLabel={WINDOW_LABELS[timeRange]}
        theaterOptions={theaterOptions}
        windowOptions={windowOptions}
        feedHref={`/app/feed?theater=${theater.id}`}
        isAuthed={!!userId}
      />

      <main className="p-6 max-w-[1800px] mx-auto">
        <div className="grid grid-cols-12 gap-6">
          {/* Map — full-width top, fixed 550px height */}
          <div className="col-span-12 h-[550px] relative rounded-lg overflow-hidden border border-slate-700">
            <MapWrapper
              events={mapEvents}
              center={mapCenter}
              zoom={mapZoom}
              visibleTypes={visibleTypes}
              palette="watch"
            />
            <MapLegend items={legendItems} />
          </div>

          {/* Left column: At a Glance + Intensity */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <KpiRail stats={stats} windowLabel={WINDOW_LABELS[timeRange]} deltas={kpiDeltas} />
            <IntensityBars data={intensity} />
          </div>

          {/* Middle column: Active Alerts */}
          <div className="col-span-12 lg:col-span-4">
            <LiveStream events={mapEvents} theaterId={theater.id} />
          </div>

          {/* Right column: Top Sources */}
          <div className="col-span-12 lg:col-span-4">
            <TopSources sources={sources} />
          </div>

          {/* Briefing — full-width below */}
          <div className="col-span-12">
            <BriefPane
              briefing={briefing}
              events={mapEvents}
              theaterId={theater.id}
              theaterLabel={theater.label}
              windowLabel={WINDOW_LABELS[timeRange]}
              eventCount={stats.events}
            />
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-slate-800/50">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-1 uppercase tracking-wider">Disclaimer</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This platform is a <strong className="text-slate-300">situational awareness tool only</strong>.
                  It does not support military targeting or operational planning. Events are algorithmically extracted and
                  scored; high-impact events require human editorial review before publication. All data is derived from
                  open-source intelligence and may contain inaccuracies.
                </p>
              </div>
            </div>
          </div>
          <div className="text-center text-xs text-slate-600">
            <p>The Sentinel Review — Washington, D.C.</p>
            <p className="mt-1">contact@thesentinelreview.com • thesentinelreview.com</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
