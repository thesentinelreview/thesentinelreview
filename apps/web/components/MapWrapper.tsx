"use client";

import dynamic from "next/dynamic";
import type { MapEvent, EventType } from "@/data/placeholder";

// MapLibre uses browser APIs — skip SSR entirely
const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface Props {
  events: MapEvent[];
  center: [number, number];
  zoom: number;
  visibleTypes: EventType[];
  palette?: "app" | "watch";
  showFebA?: boolean;
  showAOI?: boolean;
  showRangeRings?: boolean;
}

export default function MapWrapper({
  events,
  center,
  zoom,
  visibleTypes,
  palette,
  showFebA,
  showAOI,
  showRangeRings,
}: Props) {
  return (
    <MapView
      events={events}
      center={center}
      zoom={zoom}
      visibleTypes={visibleTypes}
      palette={palette}
      showFebA={showFebA}
      showAOI={showAOI}
      showRangeRings={showRangeRings}
    />
  );
}
