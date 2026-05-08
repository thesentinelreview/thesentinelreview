"use client";

import dynamic from "next/dynamic";
import type { MapEvent } from "@/data/placeholder";

// MapLibre uses browser APIs — skip SSR entirely
const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface Props {
  events: MapEvent[];
}

export default function MapWrapper({ events }: Props) {
  return <MapView events={events} />;
}
