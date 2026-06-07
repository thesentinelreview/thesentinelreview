import Link from "next/link";
import { Fragment } from "react";
import { Crosshair, BarChart3 } from "lucide-react";
import SectorRow from "./SectorRow";
import ThreatAxes from "./ThreatAxes";
import IntensityBars from "./IntensityBars";
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
  const isIntensity = activeTab === "intensity";
  const titleText = isIntensity ? "Activity Intensity" : isAxes ? "Threat Axes" : "Sector Threat";
  const Icon = isIntensity ? BarChart3 : Crosshair;
  const iconBg = isIntensity
    ? "bg-purple-500/10 border-purple-500/20"
    : "bg-red-500/10 border-red-500/20";
  const iconColor = isIntensity ? "text-purple-400" : "text-red-400";
  // Intensity is always 7-day; sectors/axes follow the dashboard window.
  const badgeText = isIntensity ? "7 DAYS" : `${windowLabel} WINDOW`;

  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl ${className}`}
    >
      {/* Pinned header: title + tabs + window badge */}
      <div className="flex-none flex items-start justify-between gap-3 p-4 border-b border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`p-1.5 rounded-lg border ${iconBg}`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wider">{titleText}</h2>
          </div>
          <nav aria-label="Threat view" className="flex items-center gap-2 text-xs ml-8 flex-wrap">
            {tabs.map((tab, i) => {
              const activeColor =
                i === 0 ? "text-emerald-400" : i === 1 ? "text-cyan-400" : "text-purple-400";
              return (
                <Fragment key={tab.label}>
                  {i > 0 && <span className="text-slate-600">•</span>}
                  <Link
                    href={tab.href}
                    replace
                    aria-current={tab.active ? "page" : undefined}
                    className={`font-semibold uppercase tracking-wider transition-colors ${
                      tab.active ? activeColor : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </Fragment>
              );
            })}
          </nav>
        </div>
        <div className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg flex-none">
          <span className="text-xs text-slate-400 font-mono font-semibold">{badgeText}</span>
        </div>
      </div>

      {/* Scrolling body */}
      <div className="flex-1 min-h-0 overflow-y-auto ds-scroll p-4">
        {isIntensity ? (
          <IntensityBars data={intensity} />
        ) : isAxes ? (
          <ThreatAxes data={threatAxes} />
        ) : sectors.length > 0 ? (
          <>
            <div className="space-y-4">
              {sectors.map((s) => (
                <SectorRow key={s.name} {...s} />
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Active sectors in window</span>
                <span className="text-slate-400 font-bold">{sectors.length} sectors</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            No sector data in window
          </div>
        )}
      </div>
    </div>
  );
}
