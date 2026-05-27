import type { ThreatAxes as ThreatAxesData } from "@/lib/types";

// Weapon-class breakdown for the selected theater. Peer of the SECTORS view:
// one horizontal bar per present weapon_type, scaled to the busiest class —
// mirrors SectorRow's visual weight so the toggle reads as the same panel.
export default function ThreatAxes({ data }: { data: ThreatAxesData }) {
  if (data.total === 0) {
    return (
      <div className="px-3 py-4 text-[10px] font-data uppercase tracking-[0.08em] text-zinc-600">
        No classified events in window
      </div>
    );
  }

  const max = Math.max(1, ...data.rows.map((r) => r.n));

  return (
    <div>
      {data.rows.map((r) => {
        const pct = Math.round((r.n / max) * 100);
        const share = Math.round((r.n / data.total) * 100);
        const label = r.weapon_type.charAt(0).toUpperCase() + r.weapon_type.slice(1);
        const bar =
          pct > 80
            ? "bg-gradient-to-r from-amber-500 to-red-500"
            : pct > 50
              ? "bg-gradient-to-r from-cyan-400 to-amber-500"
              : "bg-teal-300";

        return (
          <div key={r.weapon_type} className="px-3 py-2.5 border-b border-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-zinc-100 truncate">{label}</span>
              <span className="text-xs font-data font-semibold text-zinc-300">{r.n}</span>
            </div>
            <div className="h-1 mt-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[10px] text-zinc-500 font-data mt-2">{share}% of classified</div>
          </div>
        );
      })}
    </div>
  );
}
