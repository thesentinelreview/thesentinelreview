import { BarChart3, TrendingUp } from "lucide-react";

export interface IntensityDayCount {
  date: string; // ISO yyyy-mm-dd
  count: number;
}

// Manual recharts replacement: SVG bar chart with a dashed reference line at avg.
// Heights normalize to the peak in the window so a quiet week is still readable.
export default function IntensityChart({ data }: { data: IntensityDayCount[] }) {
  const hasActivity = data.some((d) => d.count > 0);
  if (data.length === 0 || !hasActivity) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-5">
          <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <BarChart3 className="w-4 h-4 text-purple-400" />
          </div>
          Activity Intensity
        </h2>
        <div className="h-[220px] flex items-center justify-center text-xs text-slate-500">
          No activity in the last 7 days
        </div>
      </div>
    );
  }

  const peak = Math.max(...data.map((d) => d.count), 1);
  const average = data.reduce((sum, d) => sum + d.count, 0) / data.length;
  const avgPctFromTop = 100 - (average / peak) * 100;

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <BarChart3 className="w-4 h-4 text-purple-400" />
          </div>
          Activity Intensity
        </h2>
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 border border-slate-700 rounded-lg">
          <TrendingUp className="w-3 h-3 text-blue-400" />
          <span className="text-xs text-slate-400">7 Days</span>
        </div>
      </div>

      <div className="relative h-[220px] pl-8 pr-2">
        {/* Y-axis ticks: 0, peak/2, peak */}
        <div className="absolute inset-y-0 left-0 w-8 flex flex-col justify-between text-[11px] font-medium text-slate-500 py-0.5">
          <span>{peak}</span>
          <span>{Math.round(peak / 2)}</span>
          <span>0</span>
        </div>

        {/* Plot area */}
        <div className="relative h-full border-l border-b border-slate-800">
          {/* Horizontal grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="border-t border-dashed border-slate-800" />
            <div className="border-t border-dashed border-slate-800" />
            <div className="border-t border-transparent" />
          </div>

          {/* Average reference line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-amber-500/80"
            style={{ top: `${avgPctFromTop}%` }}
          >
            <span className="absolute -top-2.5 right-1 text-[11px] font-semibold text-amber-400 bg-slate-900 px-1">
              Avg: {Math.round(average)}
            </span>
          </div>

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-2 px-2">
            {data.map((d) => {
              const h = (d.count / peak) * 100;
              return (
                <div
                  key={d.date}
                  className="group flex-1 flex flex-col items-center justify-end h-full relative"
                >
                  <div
                    className="w-full max-w-[60px] mx-auto rounded-t-md transition-opacity"
                    style={{
                      height: `${Math.max(2, h)}%`,
                      background:
                        "linear-gradient(180deg, rgba(59,130,246,0.9) 0%, rgba(59,130,246,0.4) 100%)",
                    }}
                  >
                    <div className="hidden group-hover:flex absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-blue-300 whitespace-nowrap shadow-lg">
                      {d.count} events
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex gap-2 px-2 mt-1">
          {data.map((d) => (
            <span key={d.date} className="flex-1 text-center text-[11px] font-medium text-slate-500">
              {formatDate(d.date)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span className="text-slate-400">Event Count</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-amber-500" />
            <span className="text-slate-400">Baseline Avg</span>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Peak: <span className="text-red-400 font-semibold">{peak}</span>
        </div>
      </div>
    </div>
  );
}
