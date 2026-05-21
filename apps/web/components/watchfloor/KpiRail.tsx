import Kpi from "./Kpi";
import type { Stats } from "@/data/placeholder";

export default function KpiRail({ stats, windowLabel }: { stats: Stats; windowLabel: string }) {
  const pct = stats.vs_7d_avg_pct;
  const eventsDelta = `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;

  return (
    <div className="overflow-x-auto border-b border-zinc-900 bg-zinc-900">
      <div className="flex items-stretch gap-px min-w-max">
        <Kpi label={`${windowLabel} Events`} value={stats.events} delta={eventsDelta} deltaColor={pct >= 0 ? "red" : "green"} hint="vs 7d avg" />
        <Kpi label="Strikes" value={stats.strikes} delta="+6" deltaColor="red" />
        <Kpi label="Contacts" value="—" delta="—" deltaColor="green" />
        <Kpi label="Movements" value="—" delta="—" deltaColor="green" />
        <Kpi label="Verified" value={stats.verified_pct} unit="%" delta="+4 pts" deltaColor="green" />
        <Kpi label="Median TTV" value="—" unit="" delta="—" deltaColor="green" />
        <Kpi label="Fusion" value="—" delta="—" deltaColor="green" />
      </div>
    </div>
  );
}
