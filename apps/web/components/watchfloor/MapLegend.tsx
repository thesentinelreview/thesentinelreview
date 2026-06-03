import Link from "next/link";
import { Layers } from "lucide-react";

export interface LegendItem {
  label: string;
  dot: string;
  href: string;
  active: boolean;
}

// Bottom-left map legend. Each event-type row remains a Link that toggles its
// type in the URL; the Confidence Level block below is static (the reskin's
// added visual context — no toggle behaviour).
export default function MapLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="absolute bottom-6 left-6 z-[420] bg-slate-950/95 border border-slate-700 rounded-xl p-5 backdrop-blur-lg shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1 bg-slate-800 rounded-lg border border-slate-700">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Legend</h3>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Event Types</div>
          <div className="space-y-2">
            {items.map((i) => (
              <Link
                key={i.label}
                href={i.href}
                className={`flex items-center gap-2.5 transition-opacity ${
                  i.active ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                <span className={`w-7 h-7 rounded-full ${dotBg(i.dot)} shadow-lg ${dotShadow(i.dot)}`} />
                <span className="text-xs text-slate-300 font-medium">{i.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Confidence Level</div>
          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />
              <span>Verified</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/20" />
              <span>Partial</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-500" />
              <span>Unconfirmed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// page.tsx builds items with Tailwind background classes like "bg-red-500".
// MapPin colors here are bigger circles + glow — pick the bg + shadow per dot.
function dotBg(dot: string): string {
  if (dot.includes("red")) return "bg-red-500";
  if (dot.includes("amber")) return "bg-amber-500";
  if (dot.includes("cyan")) return "bg-cyan-500";
  if (dot.includes("blue")) return "bg-blue-500";
  return "bg-slate-500";
}

function dotShadow(dot: string): string {
  if (dot.includes("red")) return "shadow-red-500/30";
  if (dot.includes("amber")) return "shadow-amber-500/30";
  if (dot.includes("cyan")) return "shadow-cyan-500/30";
  if (dot.includes("blue")) return "shadow-blue-500/30";
  return "shadow-slate-500/30";
}
