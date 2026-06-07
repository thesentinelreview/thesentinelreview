import type { Metadata } from "next";
import { FileText, ShieldCheck, ShieldAlert, AlertCircle, Layers, GitMerge, Inbox, Crosshair, GitFork, Gauge, Eye } from "lucide-react";

export const metadata: Metadata = {
  title: "Verification Methodology — Sentinel Review",
};

const CARD = "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl";
const SUBCARD = "bg-slate-800/30 border border-slate-700/50 rounded-lg p-4";
const RULE_LINE = "mt-3 font-mono text-[11px] text-slate-400 border-t border-slate-700/50 pt-2";

const CONFIDENCE_LEVELS = [
  {
    label: "Verified",
    pillCls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    description:
      "Corroborated by at least two independent sources from different platforms or organisations, plus at least one of: geolocated footage, official acknowledgment, or matching wire-service report.",
    rule: "→ ≥2 independent sources, different platforms · + geolocation OR official acknowledgment OR wire corroboration",
  },
  {
    label: "Partial",
    pillCls: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    description:
      "Multiple sources exist but all are from the same platform, or a single tier-1 source is paired with one corroborating circumstantial signal. The event likely occurred but cannot be fully confirmed.",
    rule: "→ ≥2 sources, same platform · OR tier-1 source + one corroborating signal",
  },
  {
    label: "Unconfirmed",
    pillCls: "bg-slate-700/40 border-slate-500/40 text-slate-200",
    description:
      "A single source, or multiple sources tracing back to a common origin (e.g. all citing the same Telegram channel). Published for awareness; treat all unconfirmed events with significant caution.",
    rule: "→ Single source · OR multiple sources with a common origin",
  },
];

const TIERS = [
  {
    n: 1,
    pillCls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    label: "High trust",
    description:
      "Government and intergovernmental wire feeds, peer-reviewed conflict research projects, and verified investigative accounts with established geolocation track records. A tier-1 source posting alone can reach partial confidence. Live examples: ISW (Institute for the Study of War), EUCOM, INDOPACOM, OFAC, The Irrawaddy.",
  },
  {
    n: 2,
    pillCls: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    label: "Medium trust",
    description:
      "Established mapping or conflict accounts with a good verification track record but less transparent methodology, regional press with known editorial stances, and community geolocation projects. Require corroboration before reaching verified.",
  },
  {
    n: 3,
    pillCls: "bg-slate-700/40 border-slate-500/40 text-slate-200",
    label: "Low trust",
    description:
      "Anonymous accounts, state-affiliated media, single-contributor Telegram milblogs, and sources with known track records of amplifying unverified or false information. High volume but low signal. Never sufficient alone for any confidence level above unconfirmed.",
  },
];

const PIPELINE: { n: string; icon: typeof Inbox; label: string; desc: string }[] = [
  {
    n: "01",
    icon: Inbox,
    label: "Ingestion",
    desc:
      "Posts are collected from curated source feeds (X, Telegram public channels, RSS, wire services, GDELT, Bluesky) on a 30-minute schedule. Every post is stored verbatim in an append-only log and never mutated.",
  },
  {
    n: "02",
    icon: Crosshair,
    label: "Entity extraction",
    desc:
      "An LLM (Anthropic Claude) analyzes each post and extracts: event type, location, approximate time, actor (if identifiable), and a brief description. Posts without a discrete conflict event are discarded. Extraction output is structured JSON — the model cannot free-text outside the schema.",
  },
  {
    n: "03",
    icon: GitFork,
    label: "Deduplication and clustering",
    desc:
      "Candidate events within 5 km and a 6-hour window of each other are clustered as potential duplicates. A second LLM pass decides whether two candidates describe the same event or distinct events. Merged candidates inherit all source links.",
  },
  {
    n: "04",
    icon: Gauge,
    label: "Confidence scoring",
    desc:
      "Each event is scored using the rules above. Source trust tiers are applied as weights. The confidence label shown on the map is deterministic from the rule set — not a probabilistic output of a model.",
  },
  {
    n: "05",
    icon: Eye,
    label: "Human review queue",
    desc:
      "High-impact events — mass casualties, nuclear or chemical signals, significant escalatory steps — and events with contradicting sources are held in the review queue regardless of source count and do not appear on the live map until a human reviewer approves them. The reviewer's decision and notes are published alongside the event.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100">
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center">
        <div className="w-full max-w-5xl mx-auto p-6 space-y-6">
          {/* Title card */}
          <section className={CARD}>
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                  Verification Methodology
                </h1>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  How Sentinel Review assesses, labels, and presents conflict events. Every claim
                  below describes the system as it currently runs in production; figures are
                  pulled from the live pipeline configuration.
                </p>
              </div>
            </div>
          </section>

          {/* Confidence Levels */}
          <section className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Confidence Levels</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CONFIDENCE_LEVELS.map((c) => (
                <div key={c.label} className={SUBCARD}>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded border ${c.pillCls}`}
                  >
                    {c.label}
                  </span>
                  <p className="mt-3 text-xs text-slate-300 leading-relaxed">{c.description}</p>
                  <div className={RULE_LINE}>{c.rule}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              <span className="font-semibold text-amber-400">High-impact hold:</span>{" "}
              Events flagged by the extraction pipeline as involving mass casualties, nuclear or
              chemical signals, or significant escalatory steps are held in the human review
              queue regardless of source count. They do not appear on the live map until a human
              reviewer approves them.
            </div>
          </section>

          {/* Source Trust Tiers */}
          <section className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <Layers className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Source Trust Tiers</h2>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Every source in the system is assigned a trust tier by a human editor. Tiers affect
              how much weight a source&apos;s posts carry in confidence scoring — a tier-1 source
              posting alone can reach <span className="text-amber-300">partial</span> confidence;
              a tier-3 source posting alone stays{" "}
              <span className="text-slate-300">unconfirmed</span>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TIERS.map((t) => (
                <div key={t.n} className={SUBCARD}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded border ${t.pillCls}`}
                    >
                      Tier {t.n}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                      {t.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{t.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Event Processing Pipeline */}
          <section className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <GitMerge className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Event Processing Pipeline</h2>
            </div>
            <div className="space-y-3">
              {PIPELINE.map(({ n, icon: Icon, label, desc }) => (
                <div key={n} className={SUBCARD}>
                  <div className="flex items-start gap-4">
                    <div className="font-mono text-sm font-bold text-blue-400 flex-shrink-0 pt-0.5">
                      {n}
                    </div>
                    <div className="p-1.5 bg-slate-700/50 rounded-md border border-slate-600/50 flex-shrink-0">
                      <Icon className="w-4 h-4 text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">{label}</div>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Content and graphic material */}
          <section className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-slate-700/50 rounded-lg border border-slate-600/50">
                <ShieldAlert className="w-5 h-5 text-slate-300" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Content and Graphic Material</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Sentinel Review does not embed media directly. Source links open in a new tab and
              may contain graphic content including footage of combat, casualties, and
              infrastructure destruction. Source posts are retained verbatim in the underlying
              data store for archival continuity, but are surfaced on the event detail page only
              behind explicit user action.
            </p>
          </section>

          {/* Errors & Corrections */}
          <section className={CARD}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Errors and Corrections</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              If you believe an event is incorrectly located, mislabeled, or based on fabricated
              sources, email corrections directly to the editorial address below. Corrections
              feed into the human review queue; the reviewer&apos;s notes are published openly in
              the event&apos;s change history.
            </p>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Confidence labels can only move down, not up, once a credible dispute has been
              filed against an event.
            </p>
            <div className="mt-5 font-mono text-xs bg-slate-800/50 border border-slate-700/50 rounded-md px-4 py-3 text-slate-300">
              corrections →{" "}
              <a
                href="mailto:corrections@thesentinelreview.com"
                className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
              >
                corrections@thesentinelreview.com
              </a>
            </div>
          </section>

          {/* Footer disclaimer — matches dashboard pattern, no D.C. credit line */}
          <section className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-1 uppercase tracking-wider">
                  Disclaimer
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This platform is a{" "}
                  <strong className="text-slate-300">situational awareness tool only</strong>.
                  It does not support military targeting or operational planning. Events are
                  algorithmically extracted and scored; high-impact events require human
                  editorial review before publication. All data is derived from open-source
                  intelligence and may contain inaccuracies.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
