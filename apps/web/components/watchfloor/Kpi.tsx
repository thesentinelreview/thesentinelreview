// One KPI cell in the rail: label, large value, optional unit/delta, and either
// a tiny inline-SVG sparkline (events/strikes) or a hint line. The bottom row is
// a fixed height so sparked and non-sparked cells stay vertically aligned.
function SparkBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  const n = data.length;
  const gap = n > 12 ? 1 : 2;
  const bw = (100 - gap * (n - 1)) / n;
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true">
      {data.map((v, i) => {
        const h = (v / max) * 20;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={20 - Math.max(h, v > 0 ? 1.5 : 0.75)}
            width={bw}
            height={Math.max(h, v > 0 ? 1.5 : 0.75)}
            rx={0.5}
            fill={color}
            opacity={v > 0 ? 0.85 : 0.25}
          />
        );
      })}
    </svg>
  );
}

export default function Kpi({
  label,
  value,
  unit,
  delta,
  deltaColor,
  hint,
  spark,
  sparkColor = "#71717a",
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaColor?: "red" | "green";
  hint?: string;
  spark?: number[];
  sparkColor?: string;
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
      <div className="mt-2 h-5">
        {spark && spark.length > 0 ? (
          <SparkBars data={spark} color={sparkColor} />
        ) : (
          <div className="text-[10px] text-zinc-600 leading-5 truncate">{hint ?? ""}</div>
        )}
      </div>
    </div>
  );
}
