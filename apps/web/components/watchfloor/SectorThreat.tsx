import Pane from "./Pane";
import SectorRow from "./SectorRow";
import IntensityBars from "./IntensityBars";
import type { IntensityDay, Sector } from "@/lib/types";

export default function SectorThreat({
  sectors,
  intensity,
  className = "",
}: {
  sectors: Sector[];
  intensity: IntensityDay[];
  className?: string;
}) {
  return (
    <Pane tag="04" title="Sector Threat" sub="7d trend" className={className}>
      <div>
        {sectors.length > 0 ? (
          sectors.map((s) => <SectorRow key={s.name} {...s} />)
        ) : (
          <div className="px-3 py-4 text-[10px] font-data uppercase tracking-[0.08em] text-zinc-600">
            No sector data available
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
