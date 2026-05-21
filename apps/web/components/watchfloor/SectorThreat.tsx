import Pane from "./Pane";
import SectorRow from "./SectorRow";
import IntensityBars from "./IntensityBars";
import type { IntensityDay } from "@/data/placeholder";

const UKRAINE_SECTORS = [
  { name: "Pokrovsk Axis",  level: "Critical", events: 17, strikes: 7, pct: 92, trend: "+38%" },
  { name: "Bakhmut Sector", level: "Elevated",  events: 11, strikes: 3, pct: 72, trend: "+19%" },
  { name: "Kupiansk Line",  level: "Moderate",  events: 8,  strikes: 2, pct: 48, trend: "+6%"  },
  { name: "Kramatorsk North", level: "Reduced", events: 6,  strikes: 1, pct: 22, trend: "−11%" },
];

export default function SectorThreat({
  intensity,
  theaterId,
  className = "",
}: {
  intensity: IntensityDay[];
  theaterId: string;
  className?: string;
}) {
  const sectors = theaterId === "ukraine" ? UKRAINE_SECTORS : [];

  return (
    <Pane tag="04" title="Sector Threat" sub="24h · 7d trend" className={className}>
      <div>
        {sectors.length > 0 ? (
          sectors.map((s) => (
            <SectorRow key={s.name} {...s} />
          ))
        ) : (
          <div className="px-3 py-4 text-[10px] font-data uppercase tracking-[0.08em] text-zinc-600">
            No sector data for this theater
          </div>
        )}
        <div className="px-3 py-2.5 border-t border-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-data">Intensity 7d</span>
          </div>
          <IntensityBars data={intensity} />
        </div>
      </div>
    </Pane>
  );
}
