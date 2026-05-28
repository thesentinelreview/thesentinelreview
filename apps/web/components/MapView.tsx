"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapEvent, EventType } from "@/lib/types";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type Pal = { strike: string; clash: string; movement: string };

// "app" = the existing site palette (used by embeds); "watch" = the watchfloor
// template palette (red / amber / cyan).
const PALETTE: Record<"app" | "watch", { core: Pal; mid: Pal; dim: Pal }> = {
  app: {
    core: { strike: "#e63946", clash: "#f4a261", movement: "#5b9eff" },
    mid: { strike: "rgba(230,57,70,0.38)", clash: "rgba(244,162,97,0.38)", movement: "rgba(91,158,255,0.38)" },
    dim: { strike: "rgba(230,57,70,0.18)", clash: "rgba(244,162,97,0.18)", movement: "rgba(91,158,255,0.18)" },
  },
  watch: {
    core: { strike: "#ef4444", clash: "#f59e0b", movement: "#22d3ee" },
    mid: { strike: "rgba(239,68,68,0.38)", clash: "rgba(245,158,11,0.38)", movement: "rgba(34,211,238,0.38)" },
    dim: { strike: "rgba(239,68,68,0.18)", clash: "rgba(245,158,11,0.18)", movement: "rgba(34,211,238,0.18)" },
  },
};

// ── Static tactical overlays (Donetsk AOI) ──────────────────────────────────
// Spec coords are [lat,lng] (Leaflet); GeoJSON/MapLibre want [lng,lat] — swapped.
const FEBA_LINE: [number, number][] = [
  [37.9, 49.8], [37.95, 49.2], [37.9, 48.8], [37.8, 48.5],
  [37.35, 48.3], [37.55, 48.1], [37.75, 47.95], [38.05, 47.8],
];
const AOI_POLY: [number, number][] = [
  [37.05, 48.42], [37.5, 48.45], [37.55, 48.2], [37.1, 48.16], [37.05, 48.42],
];
const RING_CENTER: [number, number] = [37.71, 48.07]; // primary Pokrovsk strike
const RING_KM = [15, 25, 40];

// Strike radar-ping sizing: the ring rests at this circle-radius and expands to
// 2.2× over the active phase, then rests invisibly (sonar blip-then-rest).
const PULSE_REST_R = 10;

function ringPolygon(center: [number, number], km: number, points = 64): [number, number][] {
  const [lng, lat] = center;
  const latDeg = km / 111.32;
  const lngDeg = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    coords.push([lng + lngDeg * Math.cos(a), lat + latDeg * Math.sin(a)]);
  }
  return coords;
}

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

// Events visible at the current playhead: matching type and already occurred.
function visibleEvents(events: MapEvent[], types: EventType[], cursorMs: number): MapEvent[] {
  return events.filter(
    (e) => types.includes(e.event_type) && new Date(e.occurred_at).getTime() <= cursorMs,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHTML(props: Record<string, unknown>, core: Pal): string {
  const type = String(props.event_type ?? "");
  const conf = String(props.confidence ?? "");
  const id = escapeHtml(String(props.id ?? ""));
  const color = core[type as keyof Pal] ?? "#e6e4dc";
  const escapedType = escapeHtml(type);
  const location = escapeHtml(String(props.location_name ?? "").toUpperCase());
  const description = escapeHtml(String(props.description ?? ""));
  const sourceCount = Number(props.source_count);
  const minutesAgo = Number(props.minutes_ago);
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
          ${escapedType.toUpperCase()} — ${location}
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
          ${sourceCount} source${sourceCount !== 1 ? "s" : ""} · ${fmtMins(minutesAgo)}
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
  visibleTypes: EventType[];
  cursorMs?: number;
  palette?: "app" | "watch";
  showFebA?: boolean;
  showAOI?: boolean;
  showRangeRings?: boolean;
}

export default function MapView({
  events,
  center,
  zoom,
  visibleTypes,
  cursorMs = Infinity,
  palette = "app",
  showFebA = false,
  showAOI = false,
  showRangeRings = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const eventsRef = useRef(events);
  const visibleTypesRef = useRef(visibleTypes);
  const cursorRef = useRef(cursorMs);
  // Keep refs current so the map's long-lived event handlers read fresh props.
  useEffect(() => {
    eventsRef.current = events;
    visibleTypesRef.current = visibleTypes;
    cursorRef.current = cursorMs;
  });

  // Initialize map once on mount; teardown on unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    let animFrame = 0;

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
      const pal = PALETTE[palette];
      const filteredOnLoad = visibleEvents(eventsRef.current, visibleTypesRef.current, cursorRef.current);

      map.addSource("events", {
        type: "geojson",
        data: buildGeoJSON(filteredOnLoad),
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 40,
      });

      // ── Static tactical overlays — added first so they render beneath pins ──
      if (showFebA) {
        map.addSource("feba", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: FEBA_LINE },
          } as GeoJSON.Feature,
        });
        map.addLayer({
          id: "feba-line",
          type: "line",
          source: "feba",
          paint: { "line-color": "#a1a1aa", "line-width": 1.4, "line-opacity": 0.7, "line-dasharray": [6, 4] },
        });
      }

      if (showAOI) {
        map.addSource("aoi", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [AOI_POLY] },
          } as GeoJSON.Feature,
        });
        map.addLayer({
          id: "aoi-fill",
          type: "fill",
          source: "aoi",
          paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "aoi-outline",
          type: "line",
          source: "aoi",
          paint: { "line-color": "#ef4444", "line-width": 1, "line-opacity": 0.55, "line-dasharray": [3, 3] },
        });
      }

      if (showRangeRings) {
        map.addSource("range-rings", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: RING_KM.map((km, i) => ({
              type: "Feature",
              properties: { ring: i },
              geometry: { type: "LineString", coordinates: ringPolygon(RING_CENTER, km) },
            })),
          } as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: "range-rings-line",
          type: "line",
          source: "range-rings",
          paint: {
            "line-color": "#ef4444",
            "line-width": 0.7,
            "line-opacity": ["match", ["get", "ring"], 0, 0.5, 1, 0.35, 2, 0.2, 0.3],
          },
        });
      }

      // Cluster circle
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": palette === "watch" ? "#71717a" : "#e6e4dc",
          "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 10, 22],
          "circle-opacity": 0.85,
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
        paint: { "text-color": palette === "watch" ? "#fafafa" : "#0c0d10" },
      });

      // Glow ring (outer) — static for non-strike pins (contacts + movements)
      map.addLayer({
        id: "pin-ring-static",
        type: "circle",
        source: "events",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!=", ["get", "event_type"], "strike"],
        ],
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "match", ["get", "event_type"],
            "strike", pal.dim.strike,
            "clash",  pal.dim.clash,
            pal.dim.movement,
          ],
          "circle-opacity": 0.45,
        },
      });

      // Radar ping — every strike emits a single outline ring that expands outward,
      // fades, then rests (sonar blip: ping … rest … ping). Transparent fill so the
      // rAF circle-stroke-opacity envelope is the sole alpha control; animates
      // circle-radius + circle-stroke-opacity only (GPU-cheap, no box-shadow). Added
      // before pin-mid so the ring sits beneath the mid ring and the static core dot.
      map.addLayer({
        id: "pin-ring-pulse",
        type: "circle",
        source: "events",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "event_type"], "strike"],
        ],
        paint: {
          "circle-radius": PULSE_REST_R,
          "circle-color": pal.core.strike,
          "circle-opacity": 0, // transparent fill → outline only
          "circle-stroke-width": 1.5,
          "circle-stroke-color": pal.core.strike,
          "circle-stroke-opacity": 0.7,
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
            "strike", pal.mid.strike,
            "clash",  pal.mid.clash,
            pal.mid.movement,
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
          // Strike cores grow with corroboration; contacts/movements stay fixed.
          "circle-radius": [
            "case",
            ["==", ["get", "event_type"], "strike"],
            ["min", 12, ["max", 4, ["+", 2, ["*", ["coalesce", ["get", "source_count"], 1], 0.9]]]],
            4,
          ],
          "circle-color": [
            "match", ["get", "event_type"],
            "strike", pal.core.strike,
            "clash",  pal.core.clash,
            pal.core.movement,
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
          .setHTML(popupHTML(props, pal.core))
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

      // Radar ping: each strike ring expands outward with ease-out over the first 80%
      // of the cycle, then holds invisible for the final 20% — a sonar blip with a rest
      // beat (ping … rest … ping), not a continuous throb. AOI outline breathes via sine.
      // All run in one rAF loop — unless the user prefers reduced motion (holds steady).
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t0 = performance.now();
      const BEACON_MS = 2400;
      function animate() {
        const elapsed = performance.now() - t0;
        const t = elapsed / 1000;
        const raw = (elapsed % BEACON_MS) / BEACON_MS; // 0→1 linear sawtooth
        // ease-out expansion over the first 80%, then hold at 1 for the rest beat
        const phase = raw < 0.8 ? 1 - Math.pow(1 - raw / 0.8, 2) : 1;

        if (map.getLayer("pin-ring-pulse")) {
          // restingRadius → 2.2× over the active phase, held at 2.2× during the rest
          map.setPaintProperty("pin-ring-pulse", "circle-radius", PULSE_REST_R * (1 + phase * 1.2));
          // 0.7 → 0, held at 0 (invisible) during the rest beat
          map.setPaintProperty("pin-ring-pulse", "circle-stroke-opacity", (1 - phase) * 0.7);
        }
        if (showAOI) {
          const sine = (Math.sin(t * Math.PI * 1.2) + 1) / 2;
          if (map.getLayer("aoi-outline"))
            map.setPaintProperty("aoi-outline", "line-opacity", 0.15 + sine * 0.55);
          if (map.getLayer("aoi-fill"))
            map.setPaintProperty("aoi-fill", "fill-opacity", 0.02 + sine * 0.06);
        }
        animFrame = requestAnimationFrame(animate);
      }
      if (prefersReduced) {
        // Reduced motion: hold one calm steady outline ring; no rAF, no sweep.
        if (map.getLayer("pin-ring-pulse")) {
          map.setPaintProperty("pin-ring-pulse", "circle-radius", PULSE_REST_R);
          map.setPaintProperty("pin-ring-pulse", "circle-stroke-opacity", 0.45);
        }
      } else {
        animFrame = requestAnimationFrame(animate);
      }

      // Sync map position to URL so the share button captures the current view.
      map.on("moveend", () => {
        const c = map.getCenter();
        const z = map.getZoom();
        const url = new URL(window.location.href);
        url.searchParams.set("lat", c.lat.toFixed(4));
        url.searchParams.set("lng", c.lng.toFixed(4));
        url.searchParams.set("zoom", z.toFixed(1));
        history.replaceState(null, "", url.toString());
      });
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(animFrame);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update visible events when data, type filter, or the playhead changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const visible = visibleEvents(events, visibleTypes, cursorMs);
    (map.getSource("events") as maplibregl.GeoJSONSource | undefined)
      ?.setData(buildGeoJSON(visible));
  }, [events, visibleTypes, cursorMs]);

  // Fly to the new theater center when center/zoom change.
  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom, duration: 1200 });
  }, [center, zoom]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
