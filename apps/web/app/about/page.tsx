import { Info } from "lucide-react";
import { getAllSources } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title:       "About — Sentinel Review",
  description:
    "Data-driven aggregation engine and intelligence dashboard for the OSINT community.",
};

const CARD =
  "bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl";

const WHAT_THIS_IS_NOT = [
  "A real-time feed — events are processed and verified before appearing on the map.",
  "An authoritative record — it is an OSINT aggregation tool, not a primary source.",
  "Complete — only events that pass through the ingestion pipeline are shown. Many events go unreported by monitored sources.",
  "Impartial by design — sources have known editorial stances. Trust tiers and source attribution are our mitigations, not a guarantee of neutrality.",
  "A targeting or intelligence tool — we actively decline to build features that would support operational military use.",
];

const CONTACT_ROWS: { label: string; value: string; href: string | null }[] = [
  { label: "General",     value: "hello@thesentinelreview.com",       href: "mailto:hello@thesentinelreview.com" },
  { label: "Corrections", value: "corrections@thesentinelreview.com", href: "mailto:corrections@thesentinelreview.com" },
  { label: "Source Tips", value: "sources@thesentinelreview.com",     href: "mailto:sources@thesentinelreview.com" },
  { label: "Press",       value: "Use the general address above",     href: null },
];

export default async function AboutPage() {
  const sources = await getAllSources();
  const activeSourceCount = sources.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <section className={`${CARD} p-6`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="text-lg font-bold text-slate-100">About Sentinel Review</h1>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            A data-driven aggregation engine and intelligence dashboard for the OSINT community.
          </p>
        </section>

        {/* What This Is */}
        <section className={`${CARD} p-6`}>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5">
            What This Is
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Confidence-based event tracking across active conflict theaters, drawing from
                open-source intelligence: Telegram channels, wire RSS feeds, X/Twitter accounts,
                GDELT, and Bluesky. Every event is scored on a three-level confidence scale
                before publication.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                <span className="text-slate-200 font-semibold">
                  Primary coverage: Ukraine — Eastern theater.
                </span>{" "}
                The map focuses on the Donetsk and Luhansk axes, strikes and ground contact.
                Additional theaters (Iran, Sudan, Myanmar) are in limited data collection.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Confidence levels are determined from source verification rules, not editorial
                opinion — a <em>verified</em> event has corroboration from at least two
                independent sources with geolocation or official acknowledgement.
              </p>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-slate-400 leading-relaxed">
                Base map tiles from MapLibre GL with OpenStreetMap data. Event markers are placed
                at the centroid of the reported location — grid-level precision where geolocated
                footage is available, settlement-level otherwise.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Every event links to its source materials. You can see exactly which posts drove
                the confidence score and read the original-language text where AI translation
                was applied.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Corrections are published openly in the event&apos;s change history. If confidence
                changes, the record reflects that — we do not silently update or remove events.
              </p>
            </div>
          </div>
        </section>

        {/* What This Is Not */}
        <section className={`${CARD} p-6`}>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5">
            What This Is Not
          </h2>
          <div className="space-y-3">
            {WHAT_THIS_IS_NOT.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 bg-slate-800/40 border border-slate-700/50 rounded-lg px-4 py-3"
              >
                <span className="text-red-500 font-bold text-sm shrink-0 mt-0.5">×</span>
                <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who Runs It */}
        <section className={`${CARD} p-6`}>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
            Who Runs It
          </h2>
          <div className="space-y-3 text-sm text-slate-400 leading-relaxed">
            <p>
              Sentinel Review is an independent project run by{" "}
              <span className="text-slate-200 font-semibold">Jacob Troxtell</span>{" "}
              through Sentinel Media Group LLC (Ohio). It has no institutional affiliation,
              no government funding, and no relationship with any military or intelligence
              organisation. The ingestion pipeline methodology is documented publicly at{" "}
              <a
                href="/methodology"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                /methodology
              </a>
              .
            </p>
            <p>
              The core map, briefings, and source data are free and publicly accessible. Future
              tiers may add additional features for professional analysts.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-700/60">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Contact
            </h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            {CONTACT_ROWS.map(({ label, value, href }) => (
              <div key={label} className="flex items-center gap-8 px-6 py-4 flex-wrap">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest w-28 shrink-0">
                  {label}
                </span>
                {href ? (
                  <a
                    href={href}
                    className="text-sm text-blue-400 hover:text-blue-300 font-mono transition-colors break-all"
                  >
                    {value}
                  </a>
                ) : (
                  <span className="text-sm text-slate-500 font-mono">{value}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Version */}
        <section className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-700/60">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Version
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-800/60">
            {[
              { label: "Product Version", value: "v0.1 (Beta)" },
              { label: "Primary Theater", value: "Ukraine — Eastern" },
              { label: "Sources Tracked", value: `${activeSourceCount} active` },
              { label: "Launched",        value: "May 2026" },
            ].map(({ label, value }) => (
              <div key={label} className="px-6 py-5">
                <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">
                  {label}
                </div>
                <div className="text-sm font-semibold text-slate-200">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center pb-6">
          <p className="text-[11px] text-slate-700 font-mono">
            AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
          </p>
        </div>
      </main>
    </div>
  );
}
