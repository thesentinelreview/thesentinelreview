import Link from "next/link";
import Panel from "@/components/ds/Panel";

export const metadata = {
  title: "Privacy Policy — The Sentinel Review",
  description:
    "What Sentinel Intelligence collects, which processors handle it, and how to reach us.",
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-3xl mx-auto px-5 py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-xs font-mono text-slate-500">
            v0.1-draft · Effective 2026-06-12 · Sentinel Media Group, LLC
          </p>
          <DraftNotice />
        </div>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>What we collect</h2>
          <p className={P}>
            This page lists what the Sentinel Intelligence dashboard actually collects — nothing
            more is gathered than what is described here.
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>
              <strong className="text-slate-300">Account:</strong> your email address and sign-in
              identity, held by our authentication provider, Clerk.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Billing:</strong> handled by Stripe. Card data
              goes to Stripe directly and never touches Sentinel servers. We store your
              subscription tier, status, billing-period end, and Stripe customer/subscription
              references.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Product usage:</strong> API keys (we store only a
              hash — never the key itself), per-key daily API call counts (for rate limiting),
              source-watch preferences you set, and an audit log of administrative actions.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Server logs:</strong> standard, transient request
              logs (such as IP address and user agent) kept by our hosting platform for operations
              and abuse prevention.
            </li>
          </ul>
          <p className={P}>
            The dashboard carries no third-party advertising or analytics trackers.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>Processors</h2>
          <p className={P}>
            Your data is processed by the services that run the product, and only those:
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>
              <strong className="text-slate-300">Clerk</strong> — authentication and account
              identity.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Stripe</strong> — payments and subscription
              billing.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Supabase</strong> — database hosting.
            </li>
            <li className={LI}>
              <strong className="text-slate-300">Vercel</strong> — web hosting and request logs.
            </li>
          </ul>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>What we do not do</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li className={LI}>We do not sell personal data.</li>
            <li className={LI}>We do not share personal data with advertisers.</li>
            <li className={LI}>
              We do not use your account or usage data for anything beyond operating, securing,
              and billing the Service.
            </li>
          </ul>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>Access and deletion</h2>
          <p className={P}>
            You can request access to, correction of, or deletion of your personal data by
            emailing{" "}
            <a href="mailto:contact@thesentinelreview.com" className={A}>
              contact@thesentinelreview.com
            </a>
            . We respond within 30 days.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>Contact</h2>
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
            <Link href="/terms" className={A}>
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
