import { TrendingUp, TrendingDown, Activity, Target, ShieldCheck, Zap } from "lucide-react";
import type { Stats } from "@/lib/types";
import type { KpiDeltas } from "@/lib/queries";

// 4-tile "At a Glance" card: Total Events / Strikes / Verified % / 7-Day Trend.
// Fed from the existing getStats + getKpiDeltas queries.
export default function KpiRail({
  stats,
  windowLabel,
  deltas,
}: {
  stats: Stats;
  windowLabel: string;
  // fusionPct + medianTtvMinutes are still queried by the page but unused in the
  // reskinned 4-tile layout — keep the props optional so the call-site doesn't
  // change behaviour.
  fusionPct?: number | null;
  medianTtvMinutes?: number | null;
  deltas: KpiDeltas;
}) {
  const totalEvents = deltas.events;
  const strikeCount = deltas.strikes;
  const verifiedPercentage = deltas.verifiedPct;
  const weeklyTrend = stats.vs_7d_avg_pct;
  const TrendIcon = weeklyTrend >= 0 ? TrendingUp : TrendingDown;
  const trendColor = weeklyTrend >= 0 ? "text-red-400" : "text-emerald-400";

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

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Total Events</p>
          <p className="text-3xl font-bold text-slate-100">{totalEvents}</p>
          <div className="mt-2 flex items-center gap-1">
            <Zap className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">All Types</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/30 rounded-lg p-4 hover:border-red-500/50 transition-colors">
          <p className="text-xs text-red-400/80 uppercase tracking-wider mb-2 font-semibold">Strikes</p>
          <p className="text-3xl font-bold text-red-400 flex items-center gap-2">
            <Target className="w-6 h-6" />
            {strikeCount}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-[10px] text-red-400/60 uppercase tracking-wider">High Priority</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/30 rounded-lg p-4 hover:border-emerald-500/50 transition-colors">
          <p className="text-xs text-emerald-400/80 uppercase tracking-wider mb-2 font-semibold">Verified</p>
          <p className="text-3xl font-bold text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            {verifiedPercentage}%
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Confidence</span>
          </div>
        </div>

        <div className={`bg-slate-800/50 border ${weeklyTrend >= 0 ? "border-red-500/30" : "border-emerald-500/30"} rounded-lg p-4 hover:border-opacity-50 transition-colors`}>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">7-Day Trend</p>
          <p className={`text-3xl font-bold ${trendColor} flex items-center gap-2`}>
            <TrendIcon className="w-6 h-6" />
            {weeklyTrend > 0 ? "+" : ""}{weeklyTrend}%
          </p>
          <div className="mt-2 flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${weeklyTrend >= 0 ? "bg-red-400" : "bg-emerald-400"}`} />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{weeklyTrend >= 0 ? "Increasing" : "Decreasing"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
