import type { ThreatAxes as ThreatAxesData, WeaponType } from "@/lib/types";

// Make exemplar uses Drone/Infantry/Artillery/Other/Missile — the live system
// classifies more weapon types (armor/naval/aircraft) so those get distinct
// gradients in the same palette family.
const WEAPON_COLOR: Record<WeaponType, string> = {
  drone: "from-orange-500 to-red-500",
  infantry: "from-cyan-500 to-teal-500",
  artillery: "from-emerald-500 to-green-500",
  missile: "from-purple-500 to-pink-500",
  armor: "from-amber-500 to-orange-500",
  naval: "from-blue-500 to-indigo-500",
  aircraft: "from-sky-500 to-blue-500",
  other: "from-slate-500 to-slate-600",
};

function titleCase(weapon: WeaponType): string {
  return weapon.charAt(0).toUpperCase() + weapon.slice(1);
}

export default function ThreatAxes({ data }: { data: ThreatAxesData }) {
  if (data.total === 0) {
    return (
      <div className="text-xs text-slate-500 uppercase tracking-wider">
        No classified events in window
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {data.rows.map((row) => {
          const pct = Math.round((row.n / data.total) * 100);
          const colorClass = WEAPON_COLOR[row.weapon_type] ?? WEAPON_COLOR.other;
          return (
            <div key={row.weapon_type} className="group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-bold text-slate-100">{titleCase(row.weapon_type)}</span>
                <span className="text-2xl font-bold text-slate-100">{row.n}</span>
              </div>
              <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-1">
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colorClass} transition-all duration-500 ease-out`}
                  style={{ width: `${pct}%` }}
                >
                  <div className="absolute inset-0 bg-white/10" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{pct}% of classified</span>
                <span className="text-[10px] text-slate-600 font-mono">
                  {row.n}/{data.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 pt-5 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Total classified threats</span>
          <span className="text-slate-400 font-bold">{data.total} events</span>
        </div>
      </div>
    </>
  );
}
