import type { SensorStripData } from "@/lib/types";

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
    <div className="overflow-x-auto border-y border-amber-500/20 bg-amber-500/[0.04]">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-data min-w-max">
        {PLATFORMS.map(({ key, label }) => {
          const count = data.platforms[key];
          const active = count >= 1;
          return (
            <span
              key={key}
              title={`${label}: ${count} posts in last 30 min`}
              className={`px-1.5 py-0.5 rounded-sm border tracking-[0.16em] ${
                active
                  ? "border-teal-400/30 text-teal-300 bg-teal-400/[0.04]"
                  : "border-zinc-800 text-zinc-600"
              }`}
            >
              {active ? "●" : "○"} {label}
            </span>
          );
        })}
        <span className="ml-2 text-zinc-500">
          LAT <span className="text-teal-300">{formatLat(data.latency_seconds)}</span>
        </span>
        <span className="text-zinc-700">|</span>
        <span className="text-zinc-500">{data.tracks} TRK</span>
      </div>
    </div>
  );
}
