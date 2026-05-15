"use client";

import { useEffect, useRef } from "react";
import type { MapAsset, MapArc } from "@/lib/types";

interface ThreatMapProps {
  assets: MapAsset[];
  arcs: MapArc[];
}

export default function ThreatMap({ assets, arcs }: ThreatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: unknown;
    import("maplibre-gl").then((maplibre) => {
      const ML = maplibre.default;
      map = new ML.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            "carto-dark": {
              type: "raster",
              tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© CartoDB",
            },
          },
          layers: [{ id: "carto-dark", type: "raster", source: "carto-dark" }],
        },
        center: [0, 20],
        zoom: 1.5,
        attributionControl: false,
      });

      mapRef.current = map;

      (map as any).on("load", () => {
        _addAssetLayer(ML, map, assets);
        _addArcLayer(map, arcs);
      });
    });

    return () => {
      if (mapRef.current) {
        (mapRef.current as any).remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line

  // Update data when props change
  useEffect(() => {
    const map = mapRef.current as any;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("assets");
    if (src) src.setData(_assetsGeoJSON(assets));
    const arcSrc = map.getSource("arcs");
    if (arcSrc) arcSrc.setData(_arcsGeoJSON(arcs));
  }, [assets, arcs]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 300 }}>
      <noscript>
        <div className="flex items-center justify-center h-full font-mono text-xs"
          style={{ color: "var(--color-ink-faint)" }}>
          THREAT MAP — JS REQUIRED
        </div>
      </noscript>
    </div>
  );
}

function _assetsGeoJSON(assets: MapAsset[]) {
  return {
    type: "FeatureCollection",
    features: assets
      .filter((a) => a.lng && a.lat)
      .map((a) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.lng, a.lat] },
        properties: {
          id: a.id,
          label: a.hostname ?? a.id.slice(0, 8),
          risk_score: a.risk_score,
          alert_count: a.alert_count,
        },
      })),
  };
}

function _arcsGeoJSON(arcs: MapArc[]) {
  const features = arcs.map((arc) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: _greatCirclePoints(
        [arc.src_lng, arc.src_lat],
        [arc.dst_lng, arc.dst_lat],
        32
      ),
    },
    properties: { severity: arc.severity, alert_id: arc.alert_id },
  }));
  return { type: "FeatureCollection", features };
}

function _greatCirclePoints(
  from: [number, number],
  to: [number, number],
  steps: number
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = from[0] + (to[0] - from[0]) * t;
    const lat = from[1] + (to[1] - from[1]) * t;
    pts.push([lng, lat]);
  }
  return pts;
}

function _addAssetLayer(ML: any, map: any, assets: MapAsset[]) {
  map.addSource("assets", { type: "geojson", data: _assetsGeoJSON(assets) });
  map.addLayer({
    id: "assets-layer",
    type: "circle",
    source: "assets",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "risk_score"], 0, 6, 100, 14],
      "circle-color": [
        "interpolate", ["linear"], ["get", "risk_score"],
        0, "#00ff88",
        50, "#ffb800",
        80, "#ff2d55",
      ],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff20",
    },
  });
}

function _addArcLayer(map: any, arcs: MapArc[]) {
  map.addSource("arcs", { type: "geojson", data: _arcsGeoJSON(arcs) });
  map.addLayer({
    id: "arcs-layer",
    type: "line",
    source: "arcs",
    paint: {
      "line-color": [
        "match", ["get", "severity"],
        "critical", "#ff2d55",
        "high",     "#ffb800",
        "medium",   "#00d4ff",
        "#607090",
      ],
      "line-width": 1.5,
      "line-opacity": 0.7,
    },
  });
}
