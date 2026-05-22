import type { IntensityDay } from "@/lib/types";

// 7-day intensity chart. Heights are normalized values (0–100); "hot" days
// render with a red gradient + glow, others blue.
export default function IntensityBars({ data }: { data: IntensityDay[] }) {
  return (
    <div className="mt-2">
      <div className="flex items-end gap-1 h-16">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col justify-end h-full">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(4, d.value)}%`,
                background: d.hot
                  ? "linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)"
                  : "linear-gradient(180deg, #2563eb 0%, #1e3a8a 100%)",
                boxShadow: d.hot ? "0 0 8px rgba(239,68,68,0.5)" : "none",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[9px] font-data text-zinc-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
