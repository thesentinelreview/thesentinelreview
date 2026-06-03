import type { ReactNode } from "react";
import { Target, ShieldCheck, Zap, Clock, Layers } from "lucide-react";
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

function MetricCell({
  label,
  value,
  valueColor = "text-slate-100",
  deltaText,
  deltaColor = "text-slate-500",
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
  deltaText?: string;
  deltaColor?: string;
}) {
  return (
    <div className="px-3 py-1.5 bg-slate-800/40 border border-slate-700/50 rounded min-w-0">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold leading-tight truncate">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <div className={`text-base font-bold ${valueColor} leading-tight`}>{value}</div>
        {deltaText && (
          <div className={`text-[10px] font-mono ${deltaColor} leading-tight`}>{deltaText}</div>
        )}
      </div>
    </div>
  );
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
    <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex-none">
      <div className="px-6 py-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 w-full">
          <MetricCell
            label={`${windowLabel} Events`}
            value={deltas.events}
            deltaText={
              eventsDeltaPct === null
                ? deltas.events > 0
                  ? "NEW"
                  : "—"
                : signedPct(eventsDeltaPct)
            }
            deltaColor={eventsDeltaColor}
          />
          <MetricCell
            label="Strikes"
            value={
              <>
                <Target className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {deltas.strikes}
              </>
            }
            valueColor="text-red-400"
            deltaText={signedNum(strikesDelta)}
            deltaColor={strikesDeltaColor}
          />
          <MetricCell
            label="Verified"
            value={
              <>
                <ShieldCheck className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {deltas.verifiedPct}%
              </>
            }
            valueColor="text-emerald-400"
            deltaText={`${verifiedDelta >= 0 ? "+" : "−"}${Math.abs(verifiedDelta)}pts`}
            deltaColor={verifiedDeltaColor}
          />
          <MetricCell
            label="Fusion"
            value={
              <>
                <Zap className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {fusionPct == null ? "—" : `${fusionPct}%`}
              </>
            }
            valueColor="text-blue-400"
          />
          <MetricCell
            label="Median TTV"
            value={
              <>
                <Clock className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {formatTtv(medianTtvMinutes)}
              </>
            }
          />
          <MetricCell
            label="Active Sectors"
            value={
              <>
                <Layers className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />
                {deltas.activeSectors}
              </>
            }
            deltaText={signedNum(sectorsDelta)}
            deltaColor={sectorsDeltaColor}
          />
        </div>
      </div>
    </div>
  );
}
