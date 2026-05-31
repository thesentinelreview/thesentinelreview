import Link from "next/link";
import { FileText, Calendar, CheckCircle, Sparkles } from "lucide-react";
import type { BriefingData } from "@/lib/types";

export interface ConfidenceCounts {
  verified: number;
  partial: number;
  unconfirmed: number;
}

export default function DailyBriefing({
  briefing,
  confidence,
  theaterId,
  theaterLabel,
}: {
  briefing: BriefingData | null;
  confidence: ConfidenceCounts;
  theaterId: string;
  theaterLabel: string;
}) {
  if (!briefing) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-8 shadow-xl">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          Daily Intelligence Briefing
        </h2>
        <p className="text-sm text-slate-400">
          No briefing has been published for {theaterLabel} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-8 shadow-xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            Daily Intelligence Briefing
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4" />
              {briefing.date}
            </div>
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400">
              <Sparkles className="w-3 h-3" />
              <span className="text-xs font-semibold">AI-Assisted</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/briefing/${briefing.id}?theater=${theaterId}`}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all text-sm border border-slate-600"
          >
            Open Brief
          </Link>
          {briefing.reviewed && (
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-sm font-semibold shadow-lg shadow-emerald-500/10">
              <CheckCircle className="w-4 h-4" />
              Published
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-6 mb-6">
        <h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
          <div className="w-1 h-5 bg-blue-500 rounded" />
          {theaterLabel} Theater Summary — {briefing.utc_time}
        </h3>
        <div className="space-y-4 pl-3">
          {briefing.paragraphs.map((paragraph, i) => (
            <p key={i} className="text-sm text-slate-300 leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-5 border-t border-slate-800 gap-4 flex-wrap">
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />
            <span className="text-slate-400 font-medium">{confidence.verified} Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/30" />
            <span className="text-slate-400 font-medium">{confidence.partial} Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span className="text-slate-400 font-medium">{confidence.unconfirmed} Unconfirmed</span>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Generated at {briefing.utc_time} • {briefing.source_count} contributing sources
        </div>
      </div>
    </div>
  );
}
