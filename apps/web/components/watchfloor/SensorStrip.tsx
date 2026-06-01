import { Circle } from "lucide-react";
import type { SensorStripData } from "@/lib/types";
import { PILL_WINDOW_MINUTES } from "@/lib/types";

const WINDOW_LABEL =
  PILL_WINDOW_MINUTES % 60 === 0 ? `${PILL_WINDOW_MINUTES / 60}h` : `${PILL_WINDOW_MINUTES}m`;

const PLATFORMS: { key: keyof SensorStripData["platforms"]; label: string }[] = [
  { key: "tg", label: "TG" },
  { key: "x", label: "X" },
  { key: "rss", label: "RSS" },
  { key: "gdelt", label: "GDELT" },
  { key: "bsky", label: "BSKY" },
];

function formatLat(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export default function SensorStrip({ data }: { data: SensorStripData }) {
  return (
    <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-amber-500/10 flex-none">
      <div className="px-6 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-bold text-amber-500/80 uppercase tracking-widest mr-3 flex-none">
              Watch Tier
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              {PLATFORMS.map(({ key, label }) => {
                const count = data.platforms[key];
                const active = count >= 1;
                return (
                  <div
                    key={key}
                    title={`${label}: ${count} posts in last ${WINDOW_LABEL}`}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 border border-slate-700/50 rounded hover:border-slate-600 transition-colors"
                  >
                    <Circle
                      className={`w-2 h-2 ${
                        active ? "text-emerald-400 fill-emerald-400" : "text-slate-600"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        active ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div
              title="LAT — age of the most recent post for this theater (freshest, not median)"
              className="flex items-center gap-2 px-3 py-1 bg-slate-800/40 border border-slate-700/50 rounded"
            >
              <span className="text-slate-500 font-semibold uppercase tracking-wider">LAT</span>
              <span className="text-cyan-400 font-mono font-bold">{formatLat(data.latency_seconds)}</span>
            </div>
            <div
              title="Distinct actor tracks observed in the last 24h"
              className="flex items-center gap-2 px-3 py-1 bg-slate-800/40 border border-slate-700/50 rounded"
            >
              <span className="text-amber-400 font-mono font-bold">{data.tracks}</span>
              <span className="text-slate-500 font-semibold uppercase tracking-wider">TRK</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
