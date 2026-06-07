import Link from "next/link";
import { FileText, Calendar, CheckCircle, Sparkles } from "lucide-react";
import type { BriefingData } from "@/lib/types";
import ExportButton from "./ExportButton";

// Pull the first sentence off the leading paragraph as an editorial headline;
// the remainder is the body. Mirrors the previous BriefPane behaviour so the
// ExportButton receives a clean headline.
function deriveHeadline(paragraphs: string[]): { headline: string; body: string[] } {
  if (paragraphs.length === 0) return { headline: "", body: [] };
  const first = paragraphs[0];
  const idx = first.indexOf(". ");
  if (idx === -1) return { headline: first, body: paragraphs.slice(1) };
  const headline = first.slice(0, idx + 1);
  const rest = first.slice(idx + 2).trim();
  return { headline, body: rest ? [rest, ...paragraphs.slice(1)] : paragraphs.slice(1) };
}

const SHELL =
  "flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl";

export default function BriefPane({
  briefing,
  theaterId,
  theaterLabel,
  windowLabel,
  eventCount,
}: {
  briefing: BriefingData | null;
  theaterId: string;
  theaterLabel: string;
  windowLabel: string;
  eventCount: number;
}) {
  if (!briefing) {
    return (
      <div className={SHELL}>
        <div className="flex-none flex items-center gap-2 p-4 border-b border-slate-800">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Daily Intelligence Briefing</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto ds-scroll p-4">
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 flex flex-col items-center justify-center text-center gap-3 h-full min-h-[140px]">
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm bg-slate-900 border border-slate-700 text-slate-500">
              No Brief
            </span>
            <p className="text-sm text-slate-400 max-w-[40ch] leading-relaxed">
              No briefing published for {theaterLabel} yet. {eventCount} {eventCount === 1 ? "event" : "events"} logged in the last {windowLabel}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { headline, body } = deriveHeadline(briefing.paragraphs);
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={SHELL}>
      {/* Pinned header: title + meta line (date · AI-Assisted · Reviewed ·
          generated time · sources) + actions. */}
      <div className="flex-none flex items-start justify-between gap-4 flex-wrap p-4 border-b border-slate-800">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1.5">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            Daily Intelligence Briefing
          </h2>
          <div className="flex items-center gap-2.5 text-sm flex-wrap">
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4" />
              {formatDate(briefing.date)}
            </div>
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400">
              <Sparkles className="w-3 h-3" />
              <span className="text-xs font-semibold">AI-Assisted</span>
            </div>
            {briefing.reviewed && (
              <>
                <span className="text-slate-600">•</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">Reviewed</span>
                </div>
              </>
            )}
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-500">{briefing.utc_time} · {briefing.source_count} sources</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-none">
          <Link
            href={`/briefing/${briefing.id}?theater=${theaterId}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all text-sm border border-slate-600"
          >
            Open Brief
          </Link>
          <ExportButton date={briefing.date} headline={headline} paragraphs={body} />
        </div>
      </div>

      {/* Scrolling body: the briefing summary (gains the room the old
          confidence-tally footer used to take). */}
      <div className="flex-1 min-h-0 overflow-y-auto ds-scroll p-4">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-5">
          {headline && (
            <h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
              <div className="w-1 h-5 bg-blue-500 rounded" />
              {headline}
            </h3>
          )}
          {body.map((p, i) => (
            <p key={i} className="text-sm text-slate-300 leading-relaxed mb-4 pl-3 last:mb-0">
              {p}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
