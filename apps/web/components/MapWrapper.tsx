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
}

export default function MapWrapper({ events, center, zoom, visibleTypes }: Props) {
  return <MapView events={events} center={center} zoom={zoom} visibleTypes={visibleTypes} />;
}
