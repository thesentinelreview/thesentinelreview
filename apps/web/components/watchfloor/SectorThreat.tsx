import Pane from "./Pane";
import SectorRow from "./SectorRow";
import IntensityBars from "./IntensityBars";
import type { IntensityDay } from "@/data/placeholder";

// Static sector rows this pass (Donetsk theater). Intensity footer is live.
const SECTORS = [
  { name: "Pokrovsk Axis", level: "Critical", events: 17, strikes: 7, pct: 92, trend: "+38%" },
  { name: "Bakhmut Sector", level: "Elevated", events: 11, strikes: 3, pct: 72, trend: "+19%" },
  { name: "Kupiansk Line", level: "Moderate", events: 8, strikes: 2, pct: 48, trend: "+6%" },
  { name: "Kramatorsk North", level: "Reduced", events: 6, strikes: 1, pct: 22, trend: "−11%" },
];

export default function SectorThreat({
  intensity,
  className = "",
}: {
  intensity: IntensityDay[];
  className?: string;
}) {
  return (
    <Pane tag="04" title="Sector Threat" sub="24h · 7d trend" className={className}>
      <div>
        {SECTORS.map((s) => (
          <SectorRow key={s.name} {...s} />
        ))}
        <div className="px-3 py-2.5 border-t border-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-data">Intensity 7d</span>
            <span className="text-[10px] font-data text-red-400">+31%</span>
          </div>
          <IntensityBars data={intensity} />
        </div>
      </div>
    </Pane>
  );
}
