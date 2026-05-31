"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import type { MapEvent } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

const eventTypeColors: Record<string, string> = {
  strike: "#ef4444",
  clash: "#f59e0b",
  movement: "#3b82f6",
};

const confidenceOpacity: Record<string, number> = {
  verified: 1,
  partial: 0.75,
  unconfirmed: 0.5,
};

export default function DashboardMap({
  events,
  center,
  zoom,
  theaterId,
}: {
  events: MapEvent[];
  center: [number, number];
  zoom: number;
  theaterId: string;
}) {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Mount the map once.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center,
      zoom,
      attributionControl: { compact: true },
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Center/zoom are only used at mount; switching theater rebuilds the page and remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-place markers whenever events change.
  useEffect(() => {
    if (!mapRef.current) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    for (const event of events) {
      const el = document.createElement("div");
      el.style.cssText = [
        "width:32px",
        "height:32px",
        "border-radius:50%",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        `background-color:${eventTypeColors[event.event_type] ?? "#94a3b8"}`,
        `opacity:${confidenceOpacity[event.confidence] ?? 0.6}`,
        "transition:transform 0.15s",
        "box-shadow:0 4px 10px rgba(0,0,0,0.45)",
        "border:2px solid rgba(15,23,42,0.6)",
      ].join(";");
      el.title = `${event.event_type} — ${event.location_name} (${event.confidence})`;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.15)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        router.push(`/event/${event.id}?theater=${theaterId}`);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([event.lng, event.lat])
        .addTo(mapRef.current!);
      markersRef.current.push(marker);
    }
  }, [events, router, theaterId]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
