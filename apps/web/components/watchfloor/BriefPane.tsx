import Link from "next/link";
import type { BriefingData, Source } from "@/lib/types";
import ExportButton from "./ExportButton";

// Use the briefing's first sentence as the editorial headline; the remainder
// becomes body copy. Falls back gracefully if there's no clean sentence split.
function deriveHeadline(paragraphs: string[]): { headline: string; body: string[] } {
  if (paragraphs.length === 0) return { headline: "", body: [] };
  const first = paragraphs[0];
  const idx = first.indexOf(". ");
  if (idx === -1) return { headline: first, body: paragraphs.slice(1) };
  const headline = first.slice(0, idx + 1);
  const rest = first.slice(idx + 2).trim();
  return { headline, body: rest ? [rest, ...paragraphs.slice(1)] : paragraphs.slice(1) };
}

export default function BriefPane({
  briefing,
  sources,
  theaterId,
  className = "",
}: {
  briefing: BriefingData | null;
  sources: Source[];
  theaterId: string;
  className?: string;
}) {
  const topSources = sources.slice(0, 3);
  const { headline, body } = briefing ? deriveHeadline(briefing.paragraphs) : { headline: "", body: [] };

  return (
    <section
      className={`flex flex-col bg-zinc-950/60 border border-emerald-500/25 rounded-sm overflow-hidden min-h-0 ${className}`}
    >
      <header className="px-3 py-2 border-b border-zinc-900 flex items-center justify-between flex-none gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-data tracking-[0.22em] uppercase px-1.5 py-0.5 rounded-sm border bg-teal-400/[0.06] border-teal-400/30 text-teal-300">
            02
          </span>
          <h3 className="text-[12px] font-semibold tracking-[0.16em] uppercase text-zinc-200 truncate">
            AI-Assisted Briefing
          </h3>
        </div>
        {briefing && (
          <div className="flex items-center gap-1.5 flex-none">
            <Link
              href={`/briefing/${briefing.id}?theater=${theaterId}`}
              className="px-2 py-1 text-[10px] rounded-sm border border-teal-400/30 bg-teal-400/[0.06] text-teal-300 tracking-wider uppercase font-data hover:bg-teal-400/15"
            >
              Open Brief
            </Link>
            <ExportButton
              date={briefing.date}
              headline={deriveHeadline(briefing.paragraphs).headline}
              paragraphs={deriveHeadline(briefing.paragraphs).body}
            />
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {briefing ? (
          <article className="px-4 py-4 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-1.5 flex-none">
              <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-teal-400/[0.08] border border-teal-400/30 text-teal-300">
                AI · Assisted
              </span>
              <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-red-500/[0.08] border border-red-500/30 text-red-400">
                Priority 1
              </span>
              <span className={`px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm border ${briefing.reviewed ? "bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-400" : "bg-zinc-800/60 border-zinc-600 text-zinc-400"}`}>
                {briefing.reviewed ? "Reviewed" : "AI Draft"}
              </span>
            </div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-data flex-none">
              {briefing.utc_time}
            </div>

            <h2 className="text-[19px] font-bold leading-[1.2] text-zinc-100 flex-none" style={{ textWrap: "pretty" }}>
              {headline}
            </h2>

            <div
              className="mt-3 text-[12.5px] text-zinc-300 leading-relaxed space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-1"
              style={{ textWrap: "pretty" }}
            >
              {body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-zinc-900 flex-none">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-zinc-400">Source Confidence</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-data">30d trust</span>
              </div>
              {topSources.length === 0 ? (
                <div className="text-[10px] font-data uppercase tracking-[0.08em] text-zinc-600">No source activity yet</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {topSources.map((s) => (
                    <div key={s.rank} className="min-w-0 border border-emerald-400/40 bg-emerald-400/[0.04] rounded-sm px-2 py-1.5">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="truncate text-emerald-200">{s.display_name}</span>
                        <span className="font-data tabular-nums ml-1 text-emerald-200">{s.verified_rate}%</span>
                      </div>
                      <div className="h-[3px] mt-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                          style={{ width: `${s.verified_rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ) : (
          <div className="px-4 py-6 h-full flex flex-col items-center justify-center text-center gap-3">
            <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-zinc-900 border border-zinc-700 text-zinc-500">
              No Brief
            </span>
            <p className="text-[13px] text-zinc-400 max-w-[32ch] leading-relaxed">
              No briefing has been generated yet for this theater.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
