import Kpi from "./Kpi";
import type { Stats } from "@/data/placeholder";

// 7-cell KPI rail. Events / Strikes / Verified are wired to live stats;
// Contacts / Movements / Median TTV / Fusion are static placeholders this pass.
export default function KpiRail({ stats }: { stats: Stats }) {
  const pct = stats.vs_7d_avg_pct;
  const eventsDelta = `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;

  return (
    <div className="flex items-stretch gap-px bg-zinc-900 border-b border-zinc-900">
      <Kpi label="24h Events" value={stats.events} delta={eventsDelta} deltaColor={pct >= 0 ? "red" : "green"} hint="vs 7d avg" />
      <Kpi label="Strikes" value={stats.strikes} delta="+6" deltaColor="red" />
      <Kpi label="Contacts" value="12" delta="+1" deltaColor="red" />
      <Kpi label="Movements" value="33" delta="−4" deltaColor="green" />
      <Kpi label="Verified" value={stats.verified_pct} unit="%" delta="+4 pts" deltaColor="green" />
      <Kpi label="Median TTV" value="23" unit="min" delta="−6m" deltaColor="green" />
      <Kpi label="Fusion" value="0.84" delta="HEALTHY" deltaColor="green" />
    </div>
  );
}
