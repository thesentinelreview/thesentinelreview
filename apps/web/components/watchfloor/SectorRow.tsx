export default function SectorRow({
  name,
  level,
  trend,
  pct,
  events,
  strikes,
}: {
  name: string;
  level: string;
  trend: string;
  pct: number;
  events: number;
  strikes: number;
}) {
  const trendUp = trend.trim().startsWith("+") || trend.trim() === "NEW";
  const trendColor = trendUp ? "text-red-400" : "text-emerald-400";
  // Pick a gradient by relative-intensity bucket so a hot sector reads as
  // amber→red while quiet sectors stay cool. Matches the gradient language
  // used in the axes view for consistency.
  const bar =
    pct > 80
      ? "from-amber-500 to-red-500"
      : pct > 50
        ? "from-cyan-400 to-amber-500"
        : "from-emerald-500 to-teal-500";

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-base font-bold text-slate-100 truncate">{name}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-none">
            {level}
          </span>
        </div>
        <span className={`text-sm font-bold font-mono ${trendColor}`}>{trend}</span>
      </div>
      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-1">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${bar} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        >
          <div className="absolute inset-0 bg-white/10" />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">
          EV {events} · STR {strikes}
        </span>
      </div>
    </div>
  );
}
