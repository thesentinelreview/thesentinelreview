import Link from "next/link";
import Pane from "./Pane";
import SectorRow from "./SectorRow";
import IntensityBars from "./IntensityBars";
import ThreatAxes from "./ThreatAxes";
import type { IntensityDay, Sector, ThreatAxes as ThreatAxesData } from "@/lib/types";
import type { ThreatView } from "@/lib/queries";

export interface ThreatTab {
  label: string;
  href: string;
  active: boolean;
}

export default function SectorThreat({
  sectors,
  intensity,
  windowLabel,
  className = "",
  tabs,
  activeTab,
  threatAxes,
}: {
  sectors: Sector[];
  intensity: IntensityDay[];
  windowLabel: string;
  className?: string;
  tabs: ThreatTab[];
  activeTab: ThreatView;
  threatAxes: ThreatAxesData;
}) {
  const isAxes = activeTab === "axes";

  return (
    <Pane
      tag="04"
      title={isAxes ? "Threat Axes" : "Sector Threat"}
      sub={isAxes ? `${windowLabel} window` : `${windowLabel} trend`}
      className={className}
    >
      {/* SECTORS | AXES toggle — server-driven Links (replace, so the back button
          isn't polluted), styled like the header's segmented controls. */}
      <div className="px-3 pt-2.5 pb-0.5 flex-none">
        <div className="inline-flex items-center rounded-sm border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          {tabs.map((t, i) => (
            <Link
              key={t.label}
              href={t.href}
              replace
              aria-current={t.active ? "page" : undefined}
              className={`px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase transition-colors ${
                i > 0 ? "border-l border-zinc-800" : ""
              } ${
                t.active
                  ? "bg-teal-400/[0.1] text-teal-300"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {isAxes ? (
        <ThreatAxes data={threatAxes} />
      ) : (
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
      )}
    </Pane>
  );
}
