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
  const trendUp = trend.trim().startsWith("+");
  const bar =
    pct > 80
      ? "bg-gradient-to-r from-amber-500 to-red-500"
      : pct > 50
        ? "bg-gradient-to-r from-cyan-400 to-amber-500"
        : "bg-teal-300";

  return (
    <div className="px-3 py-2.5 border-b border-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-zinc-100 truncate">{name}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 flex-none">{level}</span>
        </div>
        <span className={`text-xs font-data font-semibold ${trendUp ? "text-red-400" : "text-emerald-400"}`}>
          {trend}
        </span>
      </div>
      <div className="h-1 mt-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500 font-data mt-2">
        <span>EV {events}</span>
        <span>STR {strikes}</span>
      </div>
    </div>
  );
}
