"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapEvent } from "@/data/placeholder";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const COLORS: Record<string, string> = {
  strike: "#e63946",
  clash: "#f4a261",
  movement: "#5b9eff",
};
const COLORS_DIM: Record<string, string> = {
  strike: "rgba(230,57,70,0.18)",
  clash: "rgba(244,162,97,0.18)",
  movement: "rgba(91,158,255,0.18)",
};
const COLORS_MID: Record<string, string> = {
  strike: "rgba(230,57,70,0.38)",
  clash: "rgba(244,162,97,0.38)",
  movement: "rgba(91,158,255,0.38)",
};

function fmtMins(m: number): string {
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m ago` : `${h}h ago`;
}

function confidenceLabel(c: string): string {
  if (c === "verified") return "● VERIFIED";
  if (c === "partial") return "PARTIAL";
  return "UNCONFIRMED";
}

function confidenceColor(c: string): string {
  return c === "verified" ? "#52b788" : "#989790";
}

function buildGeoJSON(events: MapEvent[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: events.map((evt) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [evt.lng, evt.lat] },
      properties: {
        id: evt.id,
        event_type: evt.event_type,
        confidence: evt.confidence,
        location_name: evt.location_name,
        description: evt.description,
        source_count: evt.source_count,
        minutes_ago: evt.minutes_ago,
      },
    })),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHTML(props: Record<string, unknown>): string {
  const type = String(props.event_type ?? "");
  const conf = String(props.confidence ?? "");
  const id = escapeHtml(String(props.id ?? ""));
  const color = COLORS[type] ?? "#e6e4dc";
  const location = escapeHtml(String(props.location_name ?? "").toUpperCase());
  const description = escapeHtml(String(props.description ?? ""));
  return `
    <div style="
      font-family: 'IBM Plex Mono', monospace;
      width: 220px;
      padding: 10px 12px;
      font-size: 10px;
      line-height: 1.5;
    ">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
        <span style="color:#5d5c58;letter-spacing:.08em;text-transform:uppercase;">
          ${type.toUpperCase()} — ${location}
        </span>
      </div>
      <div style="color:${confidenceColor(conf)};letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;">
        ${confidenceLabel(conf)}
      </div>
      <div style="font-size:12px;line-height:1.45;color:#e6e4dc;margin-bottom:8px;">
        ${description}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;color:#989790;">
        <span>
          <span style="
            display:inline-block;
            width:8px;height:8px;border-radius:50%;
            background:${color};
            margin-right:5px;vertical-align:middle;
          "></span>
          ${props.source_count} source${Number(props.source_count) !== 1 ? "s" : ""} · ${fmtMins(Number(props.minutes_ago))}
        </span>
        <a href="/event/${id}" style="
          color:#e6e4dc;
          text-decoration:none;
          font-size:9px;
          letter-spacing:.08em;
          border-bottom:1px solid #3a3d46;
          pointer-events:auto;
        ">Details →</a>
      </div>
    </div>
  `;
}

interface Props {
  events: MapEvent[];
  center: [number, number];
  zoom: number;
}

export default function MapView({ events, center, zoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // Keep a ref so the "load" handler always reads the latest events even if
  // the prop changed between mount and the style finishing loading.
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Initialize map once on mount; teardown on unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("load", () => {
      map.addSource("events", {
        type: "geojson",
        data: buildGeoJSON(eventsRef.current),
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 40,
      });

      // Cluster circle
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#e6e4dc",
          "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 10, 22],
          "circle-opacity": 0.9,
        },
      });

      // Cluster count
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 11,
        },
        paint: { "text-color": "#0c0d10" },
      });

      // Glow ring (outer)
      map.addLayer({
        id: "pin-ring",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 13,
          "circle-color": [
            "match", ["get", "event_type"],
            "strike", COLORS_DIM.strike,
            "clash",  COLORS_DIM.clash,
            COLORS_DIM.movement,
          ],
        },
      });

      // Mid ring
      map.addLayer({
        id: "pin-mid",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match", ["get", "event_type"],
            "strike", COLORS_MID.strike,
            "clash",  COLORS_MID.clash,
            COLORS_MID.movement,
          ],
        },
      });

      // Core dot
      map.addLayer({
        id: "pin-core",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 4,
          "circle-color": [
            "match", ["get", "event_type"],
            "strike", COLORS.strike,
            "clash",  COLORS.clash,
            COLORS.movement,
          ],
        },
      });

      // Cursor on hover
      map.on("mouseenter", "pin-core", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pin-core", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      // Click individual pin → popup
      map.on("click", "pin-core", (e) => {
        if (!e.features?.length) return;
        const feat = e.features[0];
        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        const props = feat.properties as Record<string, unknown>;

        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 16,
          className: "sr-popup",
          maxWidth: "none",
        })
          .setLngLat(coords)
          .setHTML(popupHTML(props))
          .addTo(map);
      });

      // Click cluster → zoom in
      map.on("click", "clusters", async (e) => {
        if (!e.features?.length) return;
        const clusterId = e.features[0].properties.cluster_id as number;
        const src = map.getSource("events") as maplibregl.GeoJSONSource;
        const expansionZoom = await src.getClusterExpansionZoom(clusterId);
        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: expansionZoom });
      });

      // Click blank map → close popup
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["pin-core", "clusters"],
        });
        if (!hits.length) {
          popupRef.current?.remove();
          popupRef.current = null;
        }
      });
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update event markers when the data changes (e.g. theater switch or refresh).
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource("events") as maplibregl.GeoJSONSource | undefined)
      ?.setData(buildGeoJSON(events));
  }, [events]);

  // Fly to the new theater center when center/zoom change.
  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom, duration: 1200 });
  }, [center, zoom]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
