"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";
import type { IntensityDay } from "@/lib/types";

// Wrap getIntensity()'s 0-100 normalized values into the {date,eventCount}
// shape Make's chart expects. Values render as relative intensity, not raw
// counts — the live data layer doesn't expose absolute per-day counts.
export default function IntensityBars({ data }: { data: IntensityDay[] }) {
  const chartData = data.map((d) => ({ date: d.label, eventCount: d.value }));
  const average = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.eventCount, 0) / chartData.length : 0;
  const peak = chartData.length > 0 ? Math.max(...chartData.map((d) => d.eventCount)) : 0;

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

      {chartData.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 uppercase tracking-wider">
          No activity data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#475569"
              style={{ fontSize: "11px", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
            />
            <YAxis
              stroke="#475569"
              style={{ fontSize: "11px", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.3)",
              }}
              labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
              itemStyle={{ color: "#3b82f6" }}
              formatter={(value: number) => [value, "Intensity"]}
              cursor={{ fill: "#1e293b", opacity: 0.5 }}
            />
            <ReferenceLine
              y={average}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: `Avg: ${Math.round(average)}`,
                fill: "#f59e0b",
                fontSize: 11,
                fontWeight: 600,
                position: "right",
              }}
            />
            <Bar dataKey="eventCount" fill="url(#barGradient)" radius={[6, 6, 0, 0]} maxBarSize={60} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span className="text-slate-400">Intensity</span>
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
