import Panel from "./Panel";

/**
 * KpiTile — stat tile on the canonical Panel chrome: uppercase font-data label,
 * big slate-100 value, optional unit / delta (emerald/red) / hint line.
 * Presentational only: props in, no data fetching. Prop shape mirrors the
 * watchfloor's bespoke Kpi so that rail can adopt this tile when it is
 * reskinned.
 */
export default function KpiTile({
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
    <Panel className="flex-1 px-4 py-3">
      <div className="text-[10px] font-data uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-data text-2xl font-semibold tabular-nums leading-none text-slate-100">
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
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
        <div className="mt-2 h-5 text-[10px] font-data text-slate-600 leading-5 truncate">
          {hint}
        </div>
      )}
    </Panel>
  );
}
