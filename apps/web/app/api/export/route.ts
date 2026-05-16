import { getMapEvents, resolveTimeRange, resolveConfidence } from "@/lib/queries";
import { resolveTheater, type EventType } from "@/data/placeholder";

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const theater = resolveTheater(searchParams.get("theater") ?? undefined);
  const timeRange = resolveTimeRange(searchParams.get("window") ?? undefined);
  const confidence = resolveConfidence(searchParams.get("confidence") ?? undefined);
  const q = searchParams.get("q") ?? undefined;
  const format = searchParams.get("format") === "geojson" ? "geojson" : "csv";

  const rawTypes = searchParams.get("types");
  const types: EventType[] = rawTypes
    ? rawTypes.split(",").filter((t): t is EventType => ALL_TYPES.includes(t as EventType))
    : ALL_TYPES;

  const all = await getMapEvents(theater.id, timeRange, confidence, q);
  const events = types.length < ALL_TYPES.length ? all.filter((e) => types.includes(e.event_type)) : all;

  if (format === "geojson") {
    const geojson = {
      type: "FeatureCollection",
      features: events.map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: {
          id: e.id,
          event_type: e.event_type,
          occurred_at: e.occurred_at,
          location_name: e.location_name,
          oblast: e.oblast,
          description: e.description,
          confidence: e.confidence,
          source_count: e.source_count,
        },
      })),
    };
    return new Response(JSON.stringify(geojson, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": 'attachment; filename="sentinel-events.geojson"',
      },
    });
  }

  // CSV
  const CSV_HEADERS = ["id", "event_type", "occurred_at", "lat", "lng", "location_name", "oblast", "description", "confidence", "source_count"];
  function csvCell(v: unknown): string {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const rows = events.map((e) =>
    [e.id, e.event_type, e.occurred_at, e.lat, e.lng, e.location_name, e.oblast, e.description, e.confidence, e.source_count]
      .map(csvCell)
      .join(","),
  );

  return new Response([CSV_HEADERS.join(","), ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="sentinel-events.csv"',
    },
  });
}
