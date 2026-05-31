"use client";

import dynamic from "next/dynamic";
import type { MapEvent } from "@/lib/types";
import MapLegend from "./MapLegend";

const DashboardMap = dynamic(() => import("./DashboardMap"), { ssr: false });

export default function DashboardMapWrapper(props: {
  events: MapEvent[];
  center: [number, number];
  zoom: number;
  theaterId: string;
}) {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-700 relative">
      <DashboardMap {...props} />
      <MapLegend />
    </div>
  );
}
