"use client";

import dynamic from "next/dynamic";
import type { MapEvent, EventType } from "@/lib/types";
import { useTimeline } from "./watchfloor/TimelineProvider";

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

export default function MapWrapper(props: Props) {
  // On the watchfloor this tracks the time scrubber; with no provider (e.g. the
  // embed map) useTimeline() returns cursor = +Infinity, so all events show.
  const { cursorMs } = useTimeline();
  return <MapView {...props} cursorMs={cursorMs} />;
}
