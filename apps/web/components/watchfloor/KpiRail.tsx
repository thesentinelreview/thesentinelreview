import { Activity, Target, ShieldCheck, Zap, Clock, Layers } from "lucide-react";
import type { KpiDeltas } from "@/lib/queries";

function formatTtv(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function signedPct(pct: number): string {
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

function signedNum(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
}

export default function KpiRail({
  windowLabel,
  fusionPct,
  medianTtvMinutes,
  deltas,
}: {
  windowLabel: string;
  fusionPct: number | null;
  medianTtvMinutes: number | null;
  deltas: KpiDeltas;
}) {
  // All deltas compare the current window to the equal-length window before it.
  const eventsDeltaPct =
    deltas.eventsPrev > 0
      ? Math.round(((deltas.events - deltas.eventsPrev) / deltas.eventsPrev) * 100)
      : null;
  const strikesDelta = deltas.strikes - deltas.strikesPrev;
  const verifiedDelta = deltas.verifiedPct - deltas.verifiedPrevPct;
  const sectorsDelta = deltas.activeSectors - deltas.activeSectorsPrev;

  // More activity = escalation → red when up, green when down. Verified is
  // the opposite: higher share = good → green when up.
  const eventsDeltaColor =
    eventsDeltaPct === null || eventsDeltaPct >= 0 ? "text-red-400" : "text-emerald-400";
  const strikesDeltaColor = strikesDelta >= 0 ? "text-red-400" : "text-emerald-400";
  const verifiedDeltaColor = verifiedDelta >= 0 ? "text-emerald-400" : "text-red-400";
  const sectorsDeltaColor = sectorsDelta >= 0 ? "text-red-400" : "text-emerald-400";

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          At a Glance
        </h2>
        <span className="text-xs text-slate-500 font-mono">Past {windowLabel}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
        {/* Events */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">
            {windowLabel} Events
          </p>
          <p className="text-3xl font-bold text-slate-100">{deltas.events}</p>
          <div className="mt-2 flex items-center gap-1">
            <Zap className="w-3 h-3 text-blue-400" />
            <span className={`text-[10px] uppercase tracking-wider ${eventsDeltaColor}`}>
              {eventsDeltaPct === null
                ? deltas.events > 0
                  ? "New"
                  : "No Change"
                : `${signedPct(eventsDeltaPct)} vs prev`}
            </span>
          </div>
        </div>

        {/* Strikes */}
        <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/30 rounded-lg p-4 hover:border-red-500/50 transition-colors">
          <p className="text-xs text-red-400/80 uppercase tracking-wider mb-2 font-semibold">
            Strikes
          </p>
          <p className="text-3xl font-bold text-red-400 flex items-center gap-2">
            <Target className="w-6 h-6" />
            {deltas.strikes}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className={`text-[10px] uppercase tracking-wider ${strikesDeltaColor}`}>
              {signedNum(strikesDelta)} vs prev
            </span>
          </div>
        </div>

        {/* Verified */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/30 rounded-lg p-4 hover:border-emerald-500/50 transition-colors">
          <p className="text-xs text-emerald-400/80 uppercase tracking-wider mb-2 font-semibold">
            Verified
          </p>
          <p className="text-3xl font-bold text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            {deltas.verifiedPct}%
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className={`text-[10px] uppercase tracking-wider ${verifiedDeltaColor}`}>
              {`${verifiedDelta >= 0 ? "+" : "−"}${Math.abs(verifiedDelta)}pts`}
            </span>
          </div>
        </div>

        {/* Fusion */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/30 rounded-lg p-4 hover:border-blue-500/50 transition-colors">
          <p className="text-xs text-blue-400/80 uppercase tracking-wider mb-2 font-semibold">
            Fusion
          </p>
          <p className="text-3xl font-bold text-blue-400 flex items-center gap-2">
            <Zap className="w-6 h-6" />
            {fusionPct == null ? "—" : `${fusionPct}%`}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-blue-400/60 uppercase tracking-wider">
              Multi-Source
            </span>
          </div>
        </div>

        {/* Median TTV */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">
            Median TTV
          </p>
          <p className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-6 h-6 text-slate-400" />
            {formatTtv(medianTtvMinutes)}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Time to Verify
            </span>
          </div>
        </div>

        {/* Active Sectors */}
        <div
          className={`bg-slate-800/50 border ${
            sectorsDelta >= 0 ? "border-red-500/30" : "border-emerald-500/30"
          } rounded-lg p-4 hover:border-opacity-50 transition-colors`}
        >
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">
            Active Sectors
          </p>
          <p className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-slate-400" />
            {deltas.activeSectors}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                sectorsDelta >= 0 ? "bg-red-400" : "bg-emerald-400"
              }`}
            />
            <span className={`text-[10px] uppercase tracking-wider ${sectorsDeltaColor}`}>
              {signedNum(sectorsDelta)} vs prev
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
