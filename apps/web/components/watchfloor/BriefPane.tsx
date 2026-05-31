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
  theaterLabel,
  windowLabel,
  eventCount,
  className = "",
}: {
  briefing: BriefingData | null;
  sources: Source[];
  theaterId: string;
  theaterLabel: string;
  windowLabel: string;
  eventCount: number;
  className?: string;
}) {
  const topSources = sources.slice(0, 3);
  const { headline, body } = briefing ? deriveHeadline(briefing.paragraphs) : { headline: "", body: [] };

  return (
    <section
      className={`flex flex-col bg-navy-mid/50 border border-gold/30 rounded-sm overflow-hidden min-h-0 ${className}`}
    >
      <header className="px-3 py-2 border-b border-gold/15 flex items-center justify-between flex-none gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-data tracking-[0.22em] uppercase px-1.5 py-0.5 rounded-sm border bg-gold/[0.08] border-gold/40 text-gold-pale">
            02
          </span>
          <h3 className="text-[12px] font-data font-semibold tracking-[0.22em] uppercase text-cream truncate">
            AI-Assisted Briefing
          </h3>
        </div>
        {briefing && (
          <div className="flex items-center gap-1.5 flex-none">
            <Link
              href={`/briefing/${briefing.id}?theater=${theaterId}`}
              className="px-2 py-1 text-[10px] rounded-sm border border-gold/40 bg-gold/[0.08] text-gold-pale tracking-wider uppercase font-data hover:bg-gold/15"
            >
              Open Brief
            </Link>
            <ExportButton
              date={briefing.date}
              headline={headline}
              paragraphs={body}
            />
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {briefing ? (
          <article className="px-4 py-4 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-1.5 flex-none">
              <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-gold/[0.08] border border-gold/30 text-gold-pale">
                AI · Assisted
              </span>
              <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-red-alert/10 border border-red-alert/40 text-red-alert">
                Priority 1
              </span>
              <span className={`px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm border ${briefing.reviewed ? "bg-[color:var(--color-low)]/10 border-[color:var(--color-low)]/40 text-[color:var(--color-low)]" : "bg-navy-mid/80 border-gold/20 text-gray-mid"}`}>
                {briefing.reviewed ? "Reviewed" : "AI Draft"}
              </span>
            </div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gold-pale/70 font-data flex-none">
              {briefing.utc_time}
            </div>

            <h2 className="text-[24px] font-display font-bold leading-[1.15] text-cream flex-none" style={{ textWrap: "pretty" }}>
              {headline}
            </h2>

            <div
              className="mt-3 text-[13px] text-gray-light leading-[1.7] space-y-2.5 flex-1 min-h-0 max-h-[280px] overflow-y-auto pr-1"
              style={{ textWrap: "pretty" }}
            >
              {body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gold/15 flex-none">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-data font-semibold tracking-[0.22em] uppercase text-gold-pale">Source Confidence</span>
                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-mid font-data">30d trust</span>
              </div>
              {topSources.length === 0 ? (
                <div className="text-[10px] font-data uppercase tracking-[0.08em] text-gray-mid/60">No source activity yet</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {topSources.map((s) => (
                    <div key={s.rank} className="min-w-0 border border-gold/30 bg-navy-deep/40 rounded-sm px-2 py-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="min-w-0 flex-1 truncate text-[10px] font-data text-gold-pale/80">{s.display_name}</span>
                        <span className="flex-none font-data tabular-nums text-[18px] font-semibold leading-none text-gold-bright">{s.verified_rate}%</span>
                      </div>
                      <div className="h-[3px] mt-1 rounded-full bg-navy-light overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gold"
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
            <span className="px-1.5 py-px text-[9px] font-data uppercase tracking-[0.22em] rounded-sm bg-navy-mid border border-gold/25 text-gold-pale">
              No Brief
            </span>
            <p className="text-[13px] text-gray-light max-w-[32ch] leading-relaxed">
              No briefing published for {theaterLabel} yet. {eventCount} {eventCount === 1 ? "event" : "events"} logged in the last {windowLabel}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
