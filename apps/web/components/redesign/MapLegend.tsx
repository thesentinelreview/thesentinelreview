import { Layers, Target, Swords, TrendingUp } from "lucide-react";

export default function MapLegend() {
  return (
    <div className="absolute bottom-6 left-6 z-10 bg-slate-950/95 border border-slate-700 rounded-xl p-5 backdrop-blur-lg shadow-2xl">
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
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                <Target className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs text-slate-300 font-medium">Strike</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Swords className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs text-slate-300 font-medium">Clash</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <TrendingUp className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs text-slate-300 font-medium">Movement</span>
            </div>
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
