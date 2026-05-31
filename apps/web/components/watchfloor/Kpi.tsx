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
    <div className="flex-1 px-4 py-3 rounded-sm bg-navy-deep/40 border border-gold/15">
      <div className="text-[10px] font-data uppercase tracking-[0.22em] text-gold-pale/70">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[30px] leading-none font-display font-bold tabular-nums text-cream">{value}</span>
        {unit && <span className="text-xs font-data text-gray-mid">{unit}</span>}
        {delta && (
          <span
            className={`text-xs font-data font-medium ml-1 tabular-nums ${
              deltaColor === "red" ? "text-red-alert" : "text-[color:var(--color-low)]"
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      {hint && (
        <div className="mt-2 h-5 text-[10px] font-data text-gray-mid/70 leading-5 truncate">{hint}</div>
      )}
    </div>
  );
}
