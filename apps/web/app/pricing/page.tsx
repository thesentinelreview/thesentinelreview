import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionDetails } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import CheckoutButton from "./CheckoutButton";
import ManageBillingButton from "./ManageBillingButton";
import s from "./pricing.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Membership — Sentinel Review",
  description:
    "Access AI-synthesized conflict intelligence. Founding Analyst pricing locked in for the first 250 subscribers.",
};

const ANALYST_PRICE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY ?? "";
const ANALYST_PRICE_YEARLY  = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY  ?? "";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

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

  return (
    <div className={s.page}>
      <SiteNav />

      {checkout === "success" && (
        <div className={s.successBanner}>
          Payment received — Analyst access is being activated (may take a moment).{" "}
          <Link href="/app">Try the dashboard →</Link>
        </div>
      )}

      {checkout === "error" && (
        <div className={s.errorBanner}>
          Something went wrong verifying your payment. If you were charged, contact us and we&rsquo;ll sort it out —
          your subscription is in Stripe and can be retrieved.{" "}
          <Link href="mailto:support@thesentinelreview.com">support@thesentinelreview.com</Link>
        </div>
      )}

      <div className={s.hero}>
        <div className={s.eyebrow}>Membership</div>
        <h1 className={s.title}>Analyst-grade OSINT, priced for serious readers</h1>
        <p className={s.sub}>
          Source feed is free — translated raw posts from every theater, no account required.
          AI synthesis (verified events, geolocation, confidence scoring, daily briefings)
          is Analyst tier.
        </p>
      </div>

      <div className={s.grid}>
        {/* ── Watch ─────────────────────────────────────────────────── */}
        <div className={s.card}>
          {tier === "watch" && <div className={s.pill}>Current plan</div>}
          <div className={s.tierLabel}>Watch</div>
          <div className={s.priceRow}>
            <span className={s.currency}>$</span>
            <span className={s.amount}>0</span>
          </div>
          <div className={s.priceNote}>Free — no credit card</div>
          <ul className={s.features}>
            <li>Source feed — translated raw OSINT posts</li>
            <li>All four active theaters</li>
            <li>Per-theater dashboards &amp; key actors</li>
          </ul>
          <div className={s.actions}>
            {userId ? (
              <Link href="/app/feed" className={`${s.btn} ${s.btnOutline}`}>
                Browse source feed →
              </Link>
            ) : (
              <Link href="/sign-up" className={`${s.btn} ${s.btnOutline}`}>
                Create free account →
              </Link>
            )}
          </div>
        </div>

        {/* ── Analyst ───────────────────────────────────────────────── */}
        <div className={`${s.card} ${s.cardFeatured}`}>
          <div className={s.pill}>Founding rate</div>
          <div className={s.tierLabel}>Analyst</div>
          <div className={s.priceRow}>
            <span className={s.currency}>$</span>
            <span className={s.amount}>12</span>
            <span className={s.unit}>/mo</span>
          </div>
          <div className={s.priceNote}>$99/yr · founding rate locked in for life</div>
          {hasAnalyst && sub?.current_period_end && (
            <div className={s.renewalNote}>
              {sub.status === "active" ? "Renews" : "Access until"}{" "}
              {fmtDate(sub.current_period_end)}
              {sub.is_founding && " · Founding rate"}
            </div>
          )}
          <ul className={s.features}>
            <li>Everything in Watch</li>
            <li>AI synthesis dashboard — geolocated, verified events</li>
            <li>Confidence scoring &amp; multi-source corroboration</li>
            <li>Real-time alerts</li>
            <li>Intensity heatmaps (30-day)</li>
            <li>Daily AI briefings</li>
          </ul>
          <div className={s.actions}>
            {hasAnalyst ? (
              <>
                <Link href="/app" className={`${s.btn} ${s.btnPrimary}`}>
                  Go to dashboard →
                </Link>
                <ManageBillingButton className={`${s.btn} ${s.btnOutline}`} />
              </>
            ) : !userId ? (
              <Link href="/sign-up" className={`${s.btn} ${s.btnPrimary}`}>
                Create account to subscribe →
              </Link>
            ) : ANALYST_PRICE_MONTHLY ? (
              <>
                <CheckoutButton
                  priceId={ANALYST_PRICE_MONTHLY}
                  className={`${s.btn} ${s.btnPrimary}`}
                >
                  Subscribe monthly — $12/mo
                </CheckoutButton>
                {ANALYST_PRICE_YEARLY && (
                  <CheckoutButton
                    priceId={ANALYST_PRICE_YEARLY}
                    className={`${s.btn} ${s.btnOutline}`}
                  >
                    Subscribe yearly — $99/yr (save 31%)
                  </CheckoutButton>
                )}
              </>
            ) : (
              <Link href="/#newsletter" className={`${s.btn} ${s.btnPrimary}`}>
                Join the waitlist →
              </Link>
            )}
          </div>
        </div>

        {/* ── Bureau ────────────────────────────────────────────────── */}
        <div className={`${s.card} ${s.cardDim}`}>
          {tier === "bureau" && <div className={s.pill}>Current plan</div>}
          <div className={s.tierLabel}>Bureau</div>
          <div className={s.priceRow}>
            <span className={s.amountTbd}>TBD</span>
          </div>
          <div className={s.priceNote}>Coming soon</div>
          <ul className={s.features}>
            <li>Everything in Analyst</li>
            <li>API access</li>
            <li>Team seats</li>
            <li>Custom theater briefings</li>
            <li>Priority support</li>
          </ul>
          <div className={s.actions}>
            <span className={`${s.btn} ${s.btnDisabled}`}>Coming soon</span>
          </div>
        </div>
      </div>

      <div className={s.fine}>
        <p>
          Founding Analyst rate ($12/mo or $99/yr) is locked in for the first 250 subscribers
          and holds as long as the subscription stays active and uninterrupted. Standard rate
          after the founding window closes: $25/mo. Cancel any time.
        </p>
        <p>
          All events are AI-generated from open-source intelligence.
          Locations and details are unverified. Not for operational use.
        </p>
      </div>
    </div>
  );
}
