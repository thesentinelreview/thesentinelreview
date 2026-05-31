import type { SensorStripData } from "@/lib/types";
import { PILL_WINDOW_MINUTES } from "@/lib/types";

const WINDOW_LABEL =
  PILL_WINDOW_MINUTES % 60 === 0 ? `${PILL_WINDOW_MINUTES / 60}h` : `${PILL_WINDOW_MINUTES}m`;

const PLATFORMS: { key: keyof SensorStripData["platforms"]; label: string }[] = [
  { key: "tg",    label: "TG" },
  { key: "x",     label: "X" },
  { key: "rss",   label: "RSS" },
  { key: "gdelt", label: "GDELT" },
  { key: "bsky",  label: "BSKY" },
];

function formatLat(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export default function SensorStrip({ data }: { data: SensorStripData }) {
  return (
    <div className="overflow-x-auto border-y border-gold/20 bg-navy-mid/40">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-data min-w-max">
        {PLATFORMS.map(({ key, label }) => {
          const count = data.platforms[key];
          const active = count >= 1;
          return (
            <span
              key={key}
              title={`${label}: ${count} posts in last ${WINDOW_LABEL}`}
              className={`px-1.5 py-0.5 rounded-sm border tracking-[0.16em] ${
                active
                  ? "border-gold/30 text-gold-pale bg-gold/[0.05]"
                  : "border-gold/15 text-gray-mid/60"
              }`}
            >
              {active ? "●" : "○"} {label}
            </span>
          );
        })}
        <span className="ml-2 text-gray-mid" title="LAT — age of the most recent post for this theater (freshest, not median)">
          LAT <span className="text-gold-pale tabular-nums">{formatLat(data.latency_seconds)}</span>
        </span>
        <span className="text-gray-mid/40">|</span>
        <span className="text-gray-mid tabular-nums">{data.tracks} TRK</span>
      </div>
    </div>
  );
}
