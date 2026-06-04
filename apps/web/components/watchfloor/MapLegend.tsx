import Link from "next/link";
import { Layers } from "lucide-react";

export interface LegendItem {
  label: string;
  dot: string;
  href: string;
  active: boolean;
}

// Bottom-left map legend. Each row is a Link that toggles its event type in
// the URL. Confidence-level explainer lives on /methodology, not here — the
// legend stays focused on what the dots on the map mean.
export default function MapLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="absolute bottom-6 left-6 z-[420] bg-gradient-to-br from-slate-900 to-slate-900/85 border border-slate-700 rounded-xl p-4 backdrop-blur-lg shadow-2xl min-w-[180px]">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Event Types</h3>
      </div>

      <div className="space-y-1.5">
        {items.map((i) => (
          <Link
            key={i.label}
            href={i.href}
            aria-pressed={i.active}
            className={`flex items-center gap-2.5 py-1 px-1.5 rounded-md transition-colors ${
              i.active
                ? "opacity-100 hover:bg-slate-800/60"
                : "opacity-40 hover:opacity-80 hover:bg-slate-800/40"
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full ${dotBg(i.dot)} shadow-lg ${dotShadow(i.dot)}`}
            />
            <span className="text-xs text-slate-300 font-medium">{i.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// page.tsx builds items with Tailwind background classes like "bg-red-500".
function dotBg(dot: string): string {
  if (dot.includes("red")) return "bg-red-500";
  if (dot.includes("amber")) return "bg-amber-500";
  if (dot.includes("cyan")) return "bg-cyan-500";
  if (dot.includes("blue")) return "bg-blue-500";
  return "bg-slate-500";
}

function dotShadow(dot: string): string {
  if (dot.includes("red")) return "shadow-red-500/40";
  if (dot.includes("amber")) return "shadow-amber-500/40";
  if (dot.includes("cyan")) return "shadow-cyan-500/40";
  if (dot.includes("blue")) return "shadow-blue-500/40";
  return "shadow-slate-500/30";
}
