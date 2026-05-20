import type { ReactNode } from "react";

// Static tactical-readout callout pinned over the map, keyed to the primary
// Pokrovsk strike. Placeholder values this pass.
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-500 uppercase tracking-[0.16em]">{k}</dt>
      <dd className="text-zinc-300 tabular-nums">{v}</dd>
    </div>
  );
}

export default function TacticalReadout() {
  return (
    <div
      className="absolute z-[420] w-[280px] bg-zinc-950/95 border border-zinc-700 rounded-sm backdrop-blur shadow-2xl font-data"
      style={{ top: "15%", left: "46%" }}
    >
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-300">TGT-0417</span>
        <span className="px-1.5 py-px text-[9px] uppercase tracking-[0.2em] rounded-sm bg-red-500/[0.08] border border-red-500/30 text-red-400">
          Priority 1
        </span>
      </div>
      <dl className="px-3 py-2 text-[10px] space-y-1">
        <Row k="Callsign" v="POKROVSK-N" />
        <Row k="MGRS" v="37U DP 8421 3290" />
        <Row k="Lat / Lon" v="48.071, 37.710" />
        <Row k="First seen" v="12:24 UTC" />
        <Row k="Impacts" v="7" />
        <Row k="Fusion src" v="3" />
        <Row k="Status" v={<span className="text-emerald-400">● Verified</span>} />
      </dl>
    </div>
  );
}
