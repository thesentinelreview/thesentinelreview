import SentinelMark from "./SentinelMark";
import { tierLabel, type Tier } from "@/lib/entitlements-core";

// Shared brand block — red Sentinel mark + "SENTINEL INTELLIGENCE" wordmark,
// Beta badge, and the viewer's tier label (W1-6). Rendered identically by the
// dashboard command bar (HeaderBar) and the content/marketing header
// (SiteHeader) so the product identity stays in lockstep and can't drift
// between the two. Signed-out (no tier prop) renders Watch.
export default function SentinelBrand({ tier }: { tier?: Tier }) {
  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl border border-red-500/30 shadow-lg shadow-red-500/20 flex-none">
        <SentinelMark className="w-7 h-7 text-red-400" size={28} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-white tracking-tight">SENTINEL INTELLIGENCE</h1>
          <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] font-semibold text-red-400 uppercase tracking-wider">
            Beta
          </span>
        </div>
        <div className="mt-0.5 text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">
          {tierLabel(tier)}
        </div>
      </div>
    </div>
  );
}
