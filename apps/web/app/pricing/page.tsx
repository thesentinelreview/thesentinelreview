import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionDetails } from "@/lib/auth";
import CheckoutButton from "./CheckoutButton";
import ManageBillingButton from "./ManageBillingButton";
import s from "./pricing.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscribe — The Sentinel Review",
  description:
    "Access AI-synthesized conflict intelligence. Founding Analyst pricing locked in for the first 250 subscribers.",
};

const ANALYST_PRICE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY ?? "";
const ANALYST_PRICE_YEARLY  = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY  ?? "";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const CHECK = "✓";
const DASH  = "—";

const TABLE_ROWS: Array<
  | { type: "group"; label: string }
  | { type: "row"; label: string; watch: string; analyst: string; bureau: string }
> = [
  { type: "group", label: "Intelligence Access" },
  { type: "row", label: "Source Feed (translated raw posts)", watch: CHECK, analyst: CHECK, bureau: CHECK },
  { type: "row", label: "All Active Theatres",               watch: CHECK, analyst: CHECK, bureau: CHECK },
  { type: "row", label: "AI Synthesis Dashboard",            watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Verified Event Feed",               watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Confidence Scoring",                watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Daily Intelligence Briefings",      watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "group", label: "Analysis Tools" },
  { type: "row", label: "Geolocation & Mapping",            watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Intensity Heatmaps",               watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Key Actor Tracking",               watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "row", label: "Event Timeline",                   watch: DASH,  analyst: CHECK, bureau: CHECK },
  { type: "group", label: "Bureau Features" },
  { type: "row", label: "API Access",                       watch: DASH,  analyst: DASH,  bureau: CHECK },
  { type: "row", label: "Team Seats",                       watch: DASH,  analyst: DASH,  bureau: CHECK },
  { type: "row", label: "Custom Theatre Briefings",         watch: DASH,  analyst: DASH,  bureau: CHECK },
  { type: "row", label: "Priority Support",                 watch: DASH,  analyst: DASH,  bureau: CHECK },
];

const FAQ_ITEMS = [
  {
    q: "What is the source feed?",
    a: "The source feed consists of raw OSINT posts collected from Telegram channels, forums, and social media in conflict zones — translated into English from Arabic, Russian, Pashto, and other languages. Every post is machine-translated and timestamped. No editorial filtering.",
  },
  {
    q: "How does AI synthesis work?",
    a: "Our pipeline processes raw source posts through Claude to extract structured events: location, actors, event type, and a confidence score based on multi-source corroboration. Events are then geolocated and surfaced in the Analyst dashboard.",
  },
  {
    q: "Is this information reliable?",
    a: "The Sentinel Review aggregates open-source intelligence — it is not independently verified. Locations, actors, and event details may be inaccurate or based on propaganda. This platform is for analytical awareness, not operational decision-making.",
  },
  {
    q: "What happens to my rate after the founding window closes?",
    a: "Your Founding Analyst rate ($12/mo or $99/yr) is locked in for life as long as your subscription remains active and uninterrupted. The standard rate after the 250-subscriber founding window closes will be $25/mo.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel at any time from the billing portal. Your Analyst access continues through the end of your current billing period, then reverts to the free Watch tier.",
  },
  {
    q: "What payment methods are accepted?",
    a: "All major credit and debit cards are accepted via Stripe. We do not store card details — all payment processing is handled by Stripe's secure infrastructure.",
  },
  {
    q: "Is there a free trial?",
    a: "The Watch tier is permanently free — no credit card required. You get full access to the source feed across all active theatres. Upgrade to Analyst when you want AI synthesis, verified events, and daily briefings.",
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const { userId }   = await auth();
  const sub          = userId ? await getSubscriptionDetails() : null;
  const tier         = sub?.status === "active" ? sub.tier : null;
  const hasAnalyst   = tier === "analyst" || tier === "bureau";

  const dateStr = fmtDate(new Date());

  return (
    <div className={s.page}>
      {/* Classification bar */}
      <div className={s.classBar}>
        <span>{dateStr}</span>
        <span>Vol. XXVII · No. 247 · Open-Source Conflict Intelligence</span>
      </div>

      {/* Banners */}
      {checkout === "success" && (
        <div className={s.successBanner}>
          Payment received — Analyst access has been activated.{" "}
          <Link href="/app">Go to the dashboard →</Link>
        </div>
      )}
      {checkout === "error" && (
        <div className={s.errorBanner}>
          Something went wrong verifying your payment. If you were charged, email{" "}
          <Link href="mailto:support@thesentinelreview.com">support@thesentinelreview.com</Link>{" "}
          and we&rsquo;ll sort it out.
        </div>
      )}

      {/* Masthead */}
      <header className={s.masthead}>
        <Image
          src="/logo-horizontal-transparent.png"
          alt="The Sentinel Review"
          width={220}
          height={60}
          className={s.mastheadLogo}
          priority
        />
        <div className={s.mastheadTitle}>THE SENTINEL REVIEW</div>
        <div className={s.mastheadTagline}>
          <em>Independent Open-Source Conflict Intelligence</em>
        </div>
      </header>

      <hr className={s.rule} />

      {/* Nav */}
      <nav className={s.nav}>
        <Link href="/app/feed">Intelligence Feed</Link>
        <Link href="/app">Theatres</Link>
        <Link href="/#methodology">Methodology</Link>
        <Link href="/pricing" aria-current="page">Subscribe</Link>
      </nav>

      {/* Hero */}
      <section className={s.hero}>
        <div className={s.heroEyebrow}>Membership &amp; Access</div>
        <h1 className={s.heroTitle}>Choose Your Vantage Point</h1>
        <p className={s.heroSubtitle}>
          <em>From raw signals to verified intelligence — select the tier that matches your mission.</em>
        </p>
      </section>

      {/* Founding banner */}
      <div className={s.foundingBanner}>
        <span className={s.foundingIcon}>⚡</span>
        <strong>FOUNDING SUBSCRIBER OFFER</strong>
        {" "}— 247 of 250 founding spots remaining. Lock in $12/mo for life.
      </div>

      {/* Tier cards */}
      <div className={s.grid}>
        {/* Watch */}
        <div className={s.card}>
          {tier === "watch" && <div className={s.cardBadge}>Current Plan</div>}
          <div className={s.cardTier}>Watch</div>
          <div className={s.cardPrice}>
            <span className={s.cardCurrency}>$</span>
            <span className={s.cardAmount}>0</span>
          </div>
          <div className={s.cardPriceNote}>Free — no credit card required</div>
          <ul className={s.features}>
            <li>Source feed — translated raw OSINT posts</li>
            <li>All four active theatres</li>
            <li>Per-theatre dashboards &amp; key actors</li>
          </ul>
          <div className={s.actions}>
            {userId ? (
              <Link href="/app/feed" className={s.btnSecondary}>
                Browse Source Feed
              </Link>
            ) : (
              <Link href="/sign-up" className={s.btnSecondary}>
                Create Free Account
              </Link>
            )}
          </div>
        </div>

        {/* Analyst */}
        <div className={`${s.card} ${s.cardFeatured}`}>
          <div className={s.cardBadge}>Founding Rate</div>
          <div className={s.cardTier}>Analyst</div>
          <div className={s.cardPrice}>
            <span className={s.cardCurrency}>$</span>
            <span className={s.cardAmount}>12</span>
            <span className={s.cardUnit}>/mo</span>
          </div>
          <div className={s.cardPriceNote}>$99/yr · founding rate locked in for life</div>
          {hasAnalyst && sub?.current_period_end && (
            <div className={s.renewalNote}>
              {sub.status === "active" ? "Renews" : "Access until"}{" "}
              {fmtDate(sub.current_period_end)}
              {sub.is_founding && " · Founding rate"}
            </div>
          )}
          <ul className={s.features}>
            <li>Everything in Watch</li>
            <li>AI synthesis — geolocated, verified events</li>
            <li>Confidence scoring &amp; multi-source corroboration</li>
            <li>Intensity heatmaps (30-day)</li>
            <li>Daily AI intelligence briefings</li>
            <li>Real-time alerts</li>
          </ul>
          <div className={s.actions}>
            {hasAnalyst ? (
              <>
                <Link href="/app" className={s.btnPrimary}>
                  Access Dashboard
                </Link>
                <ManageBillingButton className={s.btnSecondary} />
              </>
            ) : !userId ? (
              <Link href="/sign-up" className={s.btnPrimary}>
                Create Account to Subscribe
              </Link>
            ) : ANALYST_PRICE_MONTHLY ? (
              <>
                <CheckoutButton priceId={ANALYST_PRICE_MONTHLY} className={s.btnGold}>
                  Claim Founding Analyst — $12/mo
                </CheckoutButton>
                {ANALYST_PRICE_YEARLY && (
                  <CheckoutButton priceId={ANALYST_PRICE_YEARLY} className={s.btnSecondary}>
                    Subscribe Yearly — $99/yr (save 31%)
                  </CheckoutButton>
                )}
              </>
            ) : (
              <Link href="/#newsletter" className={s.btnPrimary}>
                Join the Waitlist
              </Link>
            )}
          </div>
        </div>

        {/* Bureau */}
        <div className={`${s.card} ${s.cardDim}`}>
          {tier === "bureau" && <div className={s.cardBadge}>Current Plan</div>}
          <div className={s.cardTier}>Bureau</div>
          <div className={s.cardPrice}>
            <span className={s.cardAmountTbd}>TBD</span>
          </div>
          <div className={s.cardPriceNote}>Coming soon · contact us for early access</div>
          <ul className={s.features}>
            <li>Everything in Analyst</li>
            <li>API access</li>
            <li>Team seats</li>
            <li>Custom theatre briefings</li>
            <li>Priority support</li>
          </ul>
          <div className={s.actions}>
            <span className={s.btnDisabled}>Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <section className={s.tableSection}>
        <h2 className={s.tableTitle}>Full Feature Comparison</h2>
        <div className={s.table}>
          <div className={`${s.tableRow} ${s.tableHeader}`}>
            <div className={s.tableFeatureCol}>Feature</div>
            <div className={s.tableColHead}>Watch</div>
            <div className={s.tableColHead}>Analyst</div>
            <div className={s.tableColHead}>Bureau</div>
          </div>
          {TABLE_ROWS.map((row, i) =>
            row.type === "group" ? (
              <div key={i} className={s.tableGroupHead}>
                {row.label}
              </div>
            ) : (
              <div key={i} className={s.tableRow}>
                <div className={s.tableFeatureCol}>{row.label}</div>
                <div className={row.watch === CHECK ? s.tableCheck : s.tableDash}>{row.watch}</div>
                <div className={row.analyst === CHECK ? s.tableCheck : s.tableDash}>{row.analyst}</div>
                <div className={row.bureau === CHECK ? s.tableCheck : s.tableDash}>{row.bureau}</div>
              </div>
            )
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className={s.faq}>
        <h2 className={s.faqTitle}>Frequently Asked Questions</h2>
        {FAQ_ITEMS.map((item, i) => (
          <details key={i} className={s.faqItem}>
            <summary className={s.faqQ}>{item.q}</summary>
            <p className={s.faqA}>{item.a}</p>
          </details>
        ))}
      </section>

      {/* Final CTA */}
      <section className={s.finalCta}>
        <div className={s.finalCtaInner}>
          <div className={s.finalCtaEyebrow}>Ready to See Clearly?</div>
          <h2 className={s.finalCtaTitle}>Join the Intelligence Network</h2>
          <p className={s.finalCtaSub}>
            247 founding spots remain. Lock in $12/mo for life — cancel anytime.
          </p>
          <div className={s.finalCtaActions}>
            {hasAnalyst ? (
              <Link href="/app" className={s.finalCtaBtn}>
                Go to Dashboard
              </Link>
            ) : !userId ? (
              <Link href="/sign-up" className={s.finalCtaBtn}>
                Create Free Account
              </Link>
            ) : ANALYST_PRICE_MONTHLY ? (
              <CheckoutButton priceId={ANALYST_PRICE_MONTHLY} className={s.finalCtaBtn}>
                Claim Founding Analyst Access
              </CheckoutButton>
            ) : (
              <Link href="/#newsletter" className={s.finalCtaBtn}>
                Join the Waitlist
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerGrid}>
          <div className={s.footerCol}>
            <div className={s.footerColHead}>The Sentinel Review</div>
            <p className={s.footerText}>
              Independent open-source conflict intelligence. All events are
              AI-generated from OSINT. Not verified. Not for operational use.
            </p>
            <p className={s.footerText}>
              © {new Date().getFullYear()} The Sentinel Review. All rights reserved.
            </p>
          </div>
          <div className={s.footerCol}>
            <div className={s.footerColHead}>Navigate</div>
            <Link href="/app/feed" className={s.footerLink}>Intelligence Feed</Link>
            <Link href="/app" className={s.footerLink}>Theatres</Link>
            <Link href="/pricing" className={s.footerLink}>Subscribe</Link>
            <Link href="/sign-in" className={s.footerLink}>Sign In</Link>
          </div>
          <div className={s.footerCol}>
            <div className={s.footerColHead}>Contact</div>
            <Link href="mailto:support@thesentinelreview.com" className={s.footerLink}>
              support@thesentinelreview.com
            </Link>
            <div className={s.footerDisclaimer}>
              Sources include Telegram OSINT channels, LiveUAMap, ISW, and other
              open-source reporting. Coverage does not imply endorsement.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
