import MapWrapper from "@/components/MapWrapper";
import { type EventType, resolveTheater } from "@/data/placeholder";
import { getMapEvents, resolveTimeRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];

export default async function EmbedMapPage({
  searchParams,
}: {
  searchParams: Promise<{ theater?: string; window?: string; types?: string }>;
}) {
  const params = await searchParams;
  const theater = resolveTheater(params.theater);
  const timeRange = resolveTimeRange(params.window);

  const rawTypes = params.types
    ? params.types.split(",").filter((t): t is EventType => ALL_TYPES.includes(t as EventType))
    : ALL_TYPES;
  const visibleTypes: EventType[] = rawTypes.length > 0 ? rawTypes : ALL_TYPES;

  const mapEvents = await getMapEvents(theater.id, timeRange);

  return (
    <div style={{
      margin: "-20px",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      fontFamily: "var(--font-mono-stack)",
    }}>
      <div style={{
        position: "absolute",
        bottom: "40px",
        left: "12px",
        zIndex: 10,
        pointerEvents: "none",
        background: "rgba(20,21,25,0.88)",
        border: "1px solid var(--border)",
        padding: "6px 10px",
        borderRadius: "3px",
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-secondary)",
      }}>
        Sentinel Review · thesentinelreview.com
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <MapWrapper
          events={mapEvents}
          center={theater.mapCenter}
          zoom={theater.mapZoom}
          visibleTypes={visibleTypes}
        />
      </div>
    </div>
  );
}
