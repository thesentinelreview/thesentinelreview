import MapWrapper from "@/components/MapWrapper";
import type { EventType, MapEvent } from "@/lib/types";
import MapLegend from "./MapLegend";

const ALL_TYPES: EventType[] = ["strike", "clash", "movement"];

export default function DashboardMapWrapper({
  events,
  center,
  zoom,
}: {
  events: MapEvent[];
  center: [number, number];
  zoom: number;
}) {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-700 relative">
      <MapWrapper events={events} center={center} zoom={zoom} visibleTypes={ALL_TYPES} palette="watch" />
      <MapLegend />
    </div>
  );
}
