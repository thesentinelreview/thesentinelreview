// One KPI cell in the rail: label, large value, an optional unit + delta, and an
// optional hint line (used by /admin/tieout). A per-cell sparkline was removed in
// P2.E; its bucket query is retained as getKpiSparklines in lib/queries.ts should
// the sparklines be reinstated with a different design.
export default function Kpi({
  label,
  value,
  unit,
  delta,
  deltaColor,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaColor?: "red" | "green";
  hint?: string;
}) {
  return (
    <div className="flex-1 px-4 py-3 rounded-sm bg-zinc-950/60 border border-zinc-800/80">
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] leading-none font-bold tabular-nums text-white">{value}</span>
        {unit && <span className="text-xs text-zinc-500">{unit}</span>}
        {delta && (
          <span
            className={`text-xs font-medium ml-1 ${
              deltaColor === "red" ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      {hint && (
        <div className="mt-2 h-5 text-[10px] text-zinc-600 leading-5 truncate">{hint}</div>
      )}
    </div>
  );
}
