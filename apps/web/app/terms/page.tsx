import Link from "next/link";
import Panel from "@/components/ds/Panel";

export const metadata = {
  title: "Terms of Service — The Sentinel Review",
  description:
    "Terms of Service and data license for Sentinel Intelligence: dashboard, exports, and the Read API.",
};

const H2 = "text-lg font-bold text-slate-100 mt-2";
const P = "text-sm text-slate-400 leading-relaxed";
const LI = "text-sm text-slate-400 leading-relaxed";
const A = "text-amber-400 hover:text-amber-300";

// Required banner (W2-5): both legal pages must not present unreviewed
// language as settled. Jake removes this line post attorney review.
function DraftNotice() {
  return (
    <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
      Draft — pending attorney review
    </p>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-3xl mx-auto px-5 py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-xs font-mono text-slate-500">
            v0.1-draft · Effective 2026-06-12 · Sentinel Media Group, LLC
          </p>
          <DraftNotice />
        </div>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>1. The service</h2>
          <p className={P}>
            Sentinel Intelligence (the &ldquo;Service&rdquo;), operated by Sentinel Media Group,
            LLC (&ldquo;Sentinel,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;), aggregates
            open-source intelligence (OSINT) about armed conflict, extracts structured events from
            it algorithmically, and labels each event with a confidence level under the published{" "}
            <Link href="/methodology" className={A}>
              methodology
            </Link>
            . The Service includes the dashboard, data exports, and the Read API.
          </p>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              This platform is a{" "}
              <strong className="text-slate-300">situational awareness tool only</strong>. It does
              not support military targeting or operational planning. Events are algorithmically
              extracted and scored; high-impact events require human editorial review before
              publication. All data is derived from open-source intelligence and may contain
              inaccuracies.
            </p>
          </div>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>2. Data license</h2>
          <p className={P}>
            Subscriber access to Service data — through the dashboard, exports, or the API — is
            licensed for <strong className="text-slate-300">personal use and internal use within
            your own organization</strong>, and for nothing else.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>
              <strong className="text-slate-300">Not permitted:</strong> redistribution,
              republication, resale, sublicensing, or bulk sharing of events, briefings, or
              datasets derived from them — in whole or in substantial part, modified or unmodified.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Permitted:</strong> brief excerpts with
              attribution to <strong className="text-slate-300">&ldquo;Sentinel
              Intelligence&rdquo;</strong> for analysis, reporting, and academic citation.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">No scraping:</strong> automated collection of
              Service data outside the{" "}
              <Link href="/docs/api" className={A}>
                documented API
              </Link>{" "}
              is not permitted.
            </li>
          </ul>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>3. API terms</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>
              API keys are personal and non-transferable. Keep them secret; you are responsible
              for use under your keys.
            </li>
            <li className={LI}>
              Rate limits apply as published in the{" "}
              <Link href="/docs/api" className={A}>
                API documentation
              </Link>
              .
            </li>
            <li className={LI}>
              Abuse — including key sharing, circumventing rate limits, or use that violates the
              data license — may result in key revocation or account termination.
            </li>
            <li className={LI}>
              Entitlements are re-checked on every request: if your subscription tier lapses, API
              access ends with it.
            </li>
          </ul>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>4. AI-generated content</h2>
          <p className={P}>
            Briefings are AI-assisted analysis over open-source reporting and are labeled as such
            wherever they appear. Confidence labels describe how an event scored under our{" "}
            <Link href="/methodology" className={A}>
              methodology
            </Link>{" "}
            — they are a description of process, not a guarantee that an event occurred as
            described.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>5. Accuracy and warranty</h2>
          <p className={P}>
            OSINT is messy: source posts may be wrong, mislocated, mistranslated, or deliberately
            false, and automated extraction adds its own errors. The Service is provided{" "}
            <strong className="text-slate-300">as is</strong>, without warranty of accuracy,
            completeness, or availability. We accept no liability for decisions made on Service
            data. Do not use the Service for military targeting, operational planning, or any
            life-safety purpose.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>6. Billing</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>
              Subscriptions are billed through Stripe. Card details go to Stripe directly and
              never touch Sentinel servers.
            </li>
            <li className={LI}>
              When your subscription ends in Stripe — by cancellation or failed payment — paid
              access ends and your account returns to the free Watch tier. There is no additional
              grace period.
            </li>
            <li className={LI}>
              Founding Analyst pricing: if you are one of the first 100 Analyst subscribers, your
              rate stays at $5.99/month for as long as your subscription remains active and
              uninterrupted. If you cancel and resubscribe later, the standard rate applies. We
              honor the founding rate through any future pricing changes.
            </li>
            <li className={LI}>
              Refund requests:{" "}
              <a href="mailto:contact@thesentinelreview.com" className={A}>
                contact@thesentinelreview.com
              </a>
              .
            </li>
          </ul>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>7. Termination</h2>
          <p className={P}>
            You may cancel at any time. We may suspend or terminate access for violations of these
            terms — in particular the data license and API terms. Sections 2, 5, and 9 survive
            termination.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>8. Changes to these terms</h2>
          <p className={P}>
            We may update these terms. Material changes will be announced on the Service with a
            new version string and effective date before they take effect; continued use after the
            effective date constitutes acceptance.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>9. Governing law</h2>
          <p className={P}>
            These terms are governed by the laws of the State of Ohio, USA, without regard to
            conflict-of-law provisions. Disputes shall be resolved in the courts of Franklin
            County, Ohio.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>10. Contact</h2>
          <p className={P}>
            Sentinel Media Group, LLC ·{" "}
            <a href="mailto:contact@thesentinelreview.com" className={A}>
              contact@thesentinelreview.com
            </a>
          </p>
        </Panel>

        <div className="flex flex-col gap-1 pt-2 border-t border-slate-800/60">
          <DraftNotice />
          <p className="text-xs text-slate-600">
            © 2026 Sentinel Media Group, LLC ·{" "}
            <Link href="/privacy" className={A}>
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
