import { Radio, CheckCircle2, Award, TrendingUp } from "lucide-react";
import type { Source } from "@/lib/types";

interface TopSourcesProps {
  sources: Source[];
}

// Map the live Platform enum onto Make's display label + badge color.
const platformDisplay: Record<string, { label: string; cls: string }> = {
  rss: { label: "RSS", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  x: { label: "X", cls: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  telegram: { label: "Telegram", cls: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  wire: { label: "Wire", cls: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  bluesky: { label: "Bluesky", cls: "bg-sky-400/20 text-sky-300 border-sky-400/30" },
};

export default function TopSources({ sources }: TopSourcesProps) {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          Top Sources
        </h2>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/50 border border-slate-700 rounded-full">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span className="text-xs text-slate-400">30 Days</span>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="text-xs text-slate-500 uppercase tracking-wider py-6 text-center">
          No source activity yet
        </div>
      ) : (
        <div className="space-y-2.5">
          {sources.map((source, index) => {
            const badge = platformDisplay[source.platform] ?? { label: source.platform.toUpperCase(), cls: "bg-slate-700/30 text-slate-400 border-slate-600/30" };
            const verified = source.verified_rate;
            const rankColor =
              index === 0
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : index === 1
                ? "bg-slate-600/20 text-slate-400 border border-slate-600/30"
                : index === 2
                ? "bg-orange-600/20 text-orange-400 border border-orange-600/30"
                : "bg-slate-700/20 text-slate-500 border border-slate-700/30";

            return (
              <div
                key={source.handle}
                className="relative group bg-slate-800/40 border border-slate-700/50 rounded-lg p-3.5 hover:border-slate-600 hover:bg-slate-800/60 transition-all"
              >
                {index === 0 && (
                  <div className="absolute -top-2 -left-2 p-1.5 bg-amber-500 rounded-full shadow-lg">
                    <Award className="w-3 h-3 text-white" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm flex-none ${rankColor}`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-slate-100 text-sm truncate">{source.display_name}</span>
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {verified >= 85 && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span className="text-[9px] text-emerald-400 font-semibold">T1</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>{source.events_count} events</span>
                        <span>•</span>
                        <span>@{source.handle}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-none ml-2">
                    <div
                      className={`text-xl font-bold ${
                        verified >= 85 ? "text-emerald-400" : verified >= 70 ? "text-amber-400" : "text-slate-400"
                      }`}
                    >
                      {verified}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">verified</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-semibold">Verification rate:</span> Percentage of events later confirmed by independent sources
        </p>
      </div>
    </div>
  );
}
