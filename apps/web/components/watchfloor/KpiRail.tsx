import Kpi from "./Kpi";
import type { Stats } from "@/lib/types";
import type { KpiSparklines, KpiDeltas } from "@/lib/queries";

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
  stats,
  windowLabel,
  fusionPct,
  medianTtvMinutes,
  sparklines,
  deltas,
}: {
  stats: Stats;
  windowLabel: string;
  fusionPct: number | null;
  medianTtvMinutes: number | null;
  sparklines: KpiSparklines;
  deltas: KpiDeltas;
}) {
  // All deltas compare the current window to the equal-length window before it.
  const eventsDeltaPct = deltas.eventsPrev > 0
    ? Math.round(((deltas.events - deltas.eventsPrev) / deltas.eventsPrev) * 100)
    : null;
  const strikesDelta = deltas.strikes - deltas.strikesPrev;
  const verifiedDelta = deltas.verifiedPct - deltas.verifiedPrevPct;
  const sectorsDelta = deltas.activeSectors - deltas.activeSectorsPrev;

  return (
    <div className="overflow-x-auto border-b border-zinc-900 bg-zinc-900">
      <div className="flex items-stretch gap-px min-w-max">
        {/* Sparked: more activity reads as escalation → red delta. */}
        <Kpi
          label={`${windowLabel} Events`}
          value={stats.events}
          delta={eventsDeltaPct === null ? (deltas.events > 0 ? "NEW" : undefined) : signedPct(eventsDeltaPct)}
          deltaColor={eventsDeltaPct === null || eventsDeltaPct >= 0 ? "red" : "green"}
          spark={sparklines.events}
          sparkColor="#22d3ee"
        />
        <Kpi
          label="Strikes"
          value={deltas.strikes}
          delta={signedNum(strikesDelta)}
          deltaColor={strikesDelta >= 0 ? "red" : "green"}
          spark={sparklines.strikes}
          sparkColor="#ef4444"
        />
        {/* Higher verification share is good → green delta (in points). */}
        <Kpi
          label="Verified"
          value={deltas.verifiedPct}
          unit="%"
          delta={`${verifiedDelta >= 0 ? "+" : "−"}${Math.abs(verifiedDelta)}pts`}
          deltaColor={verifiedDelta >= 0 ? "green" : "red"}
        />
        <Kpi
          label="Fusion"
          value={fusionPct == null ? "—" : fusionPct}
          unit={fusionPct == null ? "" : "%"}
        />
        <Kpi label="Median TTV" value={formatTtv(medianTtvMinutes)} />
        <Kpi
          label="Active Sectors"
          value={deltas.activeSectors}
          delta={signedNum(sectorsDelta)}
          deltaColor={sectorsDelta >= 0 ? "red" : "green"}
        />
      </div>
    </div>
  );
}
