import type { IntensityDay } from "@/lib/types";

// 7-day intensity chart. Heights are normalized values (0–100); "hot" days
// render in red-alert with a matching glow, others sit on muted navy with a
// thin gold top-edge tick.
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
                  ? "linear-gradient(180deg, #C0392B 0%, #7A1F18 100%)"
                  : "var(--navy-subtle)",
                boxShadow: d.hot ? "0 0 8px rgba(192,57,43,0.5)" : "none",
                borderTop: d.hot ? "none" : "1px solid rgba(184,136,42,0.35)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[9px] font-data text-gray-mid">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
