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
  const bar = pct > 80 ? "bg-red-alert" : pct > 50 ? "bg-contact" : "bg-[color:var(--color-low)]";

  return (
    <div className="px-3 py-2.5 border-b border-gold/15">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-cream truncate">{name}</span>
          <span className="text-[10px] font-data uppercase tracking-[0.18em] text-gold-pale/70 flex-none">{level}</span>
        </div>
        <span className={`text-xs font-data font-semibold tabular-nums ${trendUp ? "text-red-alert" : "text-[color:var(--color-low)]"}`}>
          {trend}
        </span>
      </div>
      <div className="h-1 mt-2 rounded-full bg-navy-light overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-mid font-data mt-2 tabular-nums">
        <span>EV {events}</span>
        <span>STR {strikes}</span>
      </div>
    </div>
  );
}
