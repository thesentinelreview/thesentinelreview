import Panel from "@/components/ds/Panel";

export const metadata = {
  title: "About — Sentinel Review",
};

const SECTION_TITLE = "text-xs font-data tracking-[0.12em] uppercase text-slate-400";

export default function AboutPage() {
  return (
    <div className="about-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-6 pb-20 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">About Sentinel Review</h1>
          <p className="text-sm text-slate-400">
            A public, free conflict intelligence dashboard for the OSINT community
          </p>
        </div>

        {/* What this is */}
        <Panel padding="md" className="flex flex-col gap-4">
          <h2 className={SECTION_TITLE}>What this is</h2>
          <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
            <p>
              Sentinel Review aggregates, verifies, and presents conflict events from open sources, with
              AI-generated daily briefings on top. The closest reference points are Liveuamap (real-time but
              shallow), ACLED (rigorous but slow), and ISW daily assessments (analytically strong but static
              prose). This product sits between them: fast like Liveuamap, analytically credible like ACLED,
              more interactive than ISW.
            </p>
            <p>
              <strong className="font-semibold text-slate-100">v0.1 covers a single theater: Ukraine, eastern oblasts.</strong> The map shows three
              event types (strikes, clashes, movements) with confidence labels on every event. Every event
              is traceable to its sources and shows a full audit trail. The AI daily briefing is always
              labeled as a draft until a human reviews it.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold text-slate-100">Verification first</div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Confidence labels are deterministic from source counts and tiers, not a model&apos;s guess.
                When in doubt, the label goes down.
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold text-slate-100">Transparent sources</div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Every event shows its full source list, platform badges, and the relationship each source
                has to the event (primary, corroborating, contradicting).
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold text-slate-100">No operational use</div>
              <div className="text-xs text-slate-400 leading-relaxed">
                This tool is for situational awareness and open-source analysis only. Nothing here supports
                targeting, tasking, or operational decision-making.
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-sm font-semibold text-slate-100">Open corrections</div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Corrections are published in each event&apos;s change history. The correction record is
                permanent and visible to everyone.
              </div>
            </div>
          </div>
        </Panel>

        {/* What this is not */}
        <Panel padding="md" className="flex flex-col gap-4">
          <h2 className={SECTION_TITLE}>What this is not</h2>
          <ul className="flex flex-col gap-2 text-sm text-slate-300 leading-relaxed">
            <li className="flex gap-2.5"><span className="text-red-400/70 mt-0.5 shrink-0">✕</span><span>A real-time feed — events are processed and verified before appearing on the map.</span></li>
            <li className="flex gap-2.5"><span className="text-red-400/70 mt-0.5 shrink-0">✕</span><span>An authoritative record — it is an OSINT aggregation tool, not a primary source.</span></li>
            <li className="flex gap-2.5"><span className="text-red-400/70 mt-0.5 shrink-0">✕</span><span>Complete — only events that pass through the ingestion pipeline are shown. Many events go unreported by monitored sources.</span></li>
            <li className="flex gap-2.5"><span className="text-red-400/70 mt-0.5 shrink-0">✕</span><span>Impartial by design — sources have known editorial stances. Trust tiers and source attribution are our mitigations, not a guarantee of neutrality.</span></li>
            <li className="flex gap-2.5"><span className="text-red-400/70 mt-0.5 shrink-0">✕</span><span>A targeting or intelligence tool — we actively decline to build features that would support operational military use.</span></li>
          </ul>
        </Panel>

        {/* Who runs it */}
        <Panel padding="md" className="flex flex-col gap-4">
          <h2 className={SECTION_TITLE}>Who runs it</h2>
          <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
            <p>
              Sentinel Review is an independent project run by <strong className="font-semibold text-slate-100">Jacob</strong>. It has no institutional
              affiliation, no government funding, and no relationship with any military or intelligence
              organisation. The source code for the ingestion pipeline methodology is documented publicly at{" "}
              <a href="/methodology" className="text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors">/methodology</a>.
            </p>
            <p>
              The product is free and public. Future tiers may add additional features for professional
              analysts, but the core map, briefings, and source data will remain free and openly accessible.
            </p>
          </div>
        </Panel>

        {/* Contact */}
        <Panel padding="md" className="flex flex-col gap-4">
          <h2 className={SECTION_TITLE}>Contact</h2>
          <div className="flex flex-col">
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-0.5 py-2.5 border-b border-slate-800 last:border-0">
              <div className="text-xs font-data tracking-[0.08em] uppercase text-slate-500">General</div>
              <div className="text-sm text-slate-300">
                <a className="text-red-400 hover:text-red-300 transition-colors" href="mailto:hello@thesentinelreview.com">hello@thesentinelreview.com</a>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-0.5 py-2.5 border-b border-slate-800 last:border-0">
              <div className="text-xs font-data tracking-[0.08em] uppercase text-slate-500">Corrections</div>
              <div className="text-sm text-slate-300">
                <a className="text-red-400 hover:text-red-300 transition-colors" href="mailto:corrections@thesentinelreview.com">corrections@thesentinelreview.com</a>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-0.5 py-2.5 border-b border-slate-800 last:border-0">
              <div className="text-xs font-data tracking-[0.08em] uppercase text-slate-500">Source tips</div>
              <div className="text-sm text-slate-300">
                <a className="text-red-400 hover:text-red-300 transition-colors" href="mailto:sources@thesentinelreview.com">sources@thesentinelreview.com</a>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-x-4 gap-y-0.5 py-2.5 border-b border-slate-800 last:border-0">
              <div className="text-xs font-data tracking-[0.08em] uppercase text-slate-500">Press</div>
              <div className="text-sm text-slate-300">Use the general address above</div>
            </div>
          </div>
        </Panel>

        {/* Version */}
        <Panel padding="md" className="flex flex-col gap-4">
          <h2 className={SECTION_TITLE}>Version</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">Product version</div>
              <div className="text-sm font-data text-slate-100 mt-1">v0.1 (MVP)</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">Theater</div>
              <div className="text-sm font-data text-slate-100 mt-1">Ukraine — Eastern</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">Sources tracked</div>
              <div className="text-sm font-data text-slate-100 mt-1">8 active</div>
            </div>
            <div className="flex flex-col">
              <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">Launched</div>
              <div className="text-sm font-data text-slate-100 mt-1">May 2026</div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
