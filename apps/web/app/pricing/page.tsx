import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { getSubscriptionDetails } from "@/lib/auth";
import CheckoutButton from "./CheckoutButton";
import ManageBillingButton from "./ManageBillingButton";
import s from "./pricing.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Membership — The Sentinel Review",
  description:
    "Sentinel Review membership tiers. Free conflict monitoring for Ukraine and the Middle East, with Founding Analyst pricing locked in for life.",
};

const ANALYST_PRICE_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY ?? "";
const ANALYST_PRICE_YEARLY  = process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY  ?? "";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type CellValue =
  | "check"
  | "dash"
  | { detail: string }
  | { plain: string };

type TableEntry =
  | { type: "group"; label: string }
  | { type: "row"; label: string; watch: CellValue; analyst: CellValue; bureau: CellValue };

const TABLE: TableEntry[] = [
  { type: "group", label: "Content & Briefings" },
  { type: "row", label: "Daily morning briefing (email)",  watch: "check",                    analyst: "check",                    bureau: "check" },
  { type: "row", label: "AI theater briefings",            watch: { detail: "Today only" },   analyst: { detail: "Full history" },  bureau: { detail: "Full history" } },
  { type: "row", label: "Weekly strategic assessment",     watch: "dash",                     analyst: "check",                    bureau: "check" },
  { type: "row", label: "Custom briefings on request",     watch: "dash",                     analyst: "dash",                     bureau: { detail: "1 / month" } },

  { type: "group", label: "Dashboard & Data" },
  { type: "row", label: "Live dashboard access",           watch: { detail: "Ukraine + ME" }, analyst: { detail: "All theaters" }, bureau: { detail: "All theaters" } },
  { type: "row", label: "Event history window",            watch: { detail: "7 days" },       analyst: { detail: "Full archive" }, bureau: { detail: "Full archive" } },
  { type: "row", label: "Verification audit trail",        watch: { detail: "Basic state" },  analyst: "check",                   bureau: { detail: "+ peer flags" } },
  { type: "row", label: "CSV / JSON exports",              watch: "dash",                     analyst: { detail: "Rate-limited" }, bureau: { detail: "Higher limits" } },

  { type: "group", label: "Alerts & Integrations" },
  { type: "row", label: "Custom alerts (topic / theater / geofence)", watch: "dash", analyst: { detail: "Email + browser" }, bureau: { detail: "+ Slack/Teams" } },
  { type: "row", label: "API access",                      watch: "dash",                     analyst: { detail: "1K calls/day" }, bureau: { detail: "25K calls/day" } },
  { type: "row", label: "Webhooks",                        watch: "dash",                     analyst: "dash",                     bureau: { detail: "Basic" } },
  { type: "row", label: "Embeddable widgets",              watch: "dash",                     analyst: { detail: "Personal (1)" }, bureau: { detail: "Newsroom unlimited" } },

  { type: "group", label: "Team & Admin" },
  { type: "row", label: "Seats",                           watch: { plain: "1" },             analyst: { plain: "1" },             bureau: { detail: "3–10" } },
  { type: "row", label: "Shared workspaces / annotations", watch: "dash",                     analyst: "dash",                     bureau: "check" },
  { type: "row", label: "Admin panel / SSO",               watch: "dash",                     analyst: "dash",                     bureau: { detail: "Admin panel" } },

  { type: "group", label: "Community & Support" },
  { type: "row", label: "Discord community",               watch: "dash",                     analyst: "check",                    bureau: "check" },
  { type: "row", label: "Quarterly methodology webinars",  watch: "dash",                     analyst: "check",                    bureau: "check" },
  { type: "row", label: "Workshops / training",            watch: "dash",                     analyst: "dash",                     bureau: { detail: "1 team workshop/yr" } },
  { type: "row", label: "Support",                         watch: { detail: "Best-effort" },  analyst: { detail: "Priority email" }, bureau: { detail: "Named contact" } },
];

function Cell({ v }: { v: CellValue }) {
  if (v === "check") return <td className={s.check}>◆</td>;
  if (v === "dash")  return <td className={s.dash}>—</td>;
  if ("detail" in v) return <td><span className={s.detail}>{v.detail}</span></td>;
  return <td>{v.plain}</td>;
}

const FAQ_ITEMS = [
  {
    q: "What does “locked in for life” actually mean?",
    a: "If you become one of the first 250 Analyst subscribers, your rate stays at $12/month (or $99/year) for as long as your subscription remains active and uninterrupted. If you cancel and resubscribe later, the standard rate applies. We honor the founding rate through any future pricing changes.",
  },
  {
    q: "What’s the difference between The Sentinel Review and the Intel Dashboard?",
    a: "The Sentinel Review is the publication — daily briefings, curated headlines, the morning email. The Intel Dashboard is a separate product for live OSINT conflict monitoring with verification scoring. Watch members get free access to both. Analyst unlocks the full dashboard archive, alerts, and tools.",
  },
  {
    q: "Is this for operational or intelligence use?",
    a: "No. Every event on the dashboard carries an explicit disclaimer: AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use. The Sentinel Review is a research and situational-awareness tool for journalists, analysts, researchers, and informed observers.",
  },
  {
    q: "Are there academic or student discounts?",
    a: "Yes. Graduate students, faculty, and accredited program researchers with a verifiable .edu email can receive 50% off the Analyst tier at the standard price ($12.50/month). Contact us with your university affiliation.",
  },
  {
    q: "When will Bureau launch?",
    a: "Bureau is targeted for the second half of 2026, once we have meaningful Analyst-tier traction and have heard sustained demand for team features. If you have a team need now, email us — we’re happy to work something out manually before the tier is formally live.",
  },
  {
    q: "How do I cancel?",
    a: "One click in your account portal, anytime. No retention calls, no friction. Founding pricing is forfeited only if you cancel.",
  },
  {
    q: "Who is behind The Sentinel Review?",
    a: "The Sentinel Review is published by Sentinel Media Group LLC (Ohio), founded and edited by Jacob Troxtell, M.S. National Security candidate at the University of New Haven, inducted into the Order of the Sword & Shield.",
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
  const dateStr      = fmtDate(new Date());

  return (
    <div className={s.page}>

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className={s.classBar}>
        <div className={s.classBarInner}>
          <div className={s.classBarLeft}>
            <span className={s.classification}>UNCLASSIFIED // PUBLIC RELEASE</span>
            <span className={s.classBarDate}>{dateStr}</span>
          </div>
          <div className={s.classBarLinks}>
            <Link href="/#newsletter" className={s.classBarLink}>Daily Briefing</Link>
            <Link href="/#regions" className={s.classBarLink}>Regional Watch</Link>
            <a href="https://dashboard.thesentinelreview.com" className={s.classBarLink}>Intel Dashboard</a>
          </div>
        </div>
      </div>

      {/* ── Banners ───────────────────────────────────────────────── */}
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

      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className={s.masthead}>
        <div className={s.mastheadInner}>
          <div className={s.mastheadAside}>
            <div className={s.asideLabel}>Tier Status</div>
            <div className={s.asideValue}>ENROLLMENT OPEN</div>
          </div>
          <div className={s.mastheadLogoBlock}>
            <Link href="/" aria-label="The Sentinel Review — Home">
              <Image
                src="/logo-horizontal-transparent.png"
                alt="The Sentinel Review"
                width={540}
                height={80}
                className={s.mastheadLogo}
                priority
              />
            </Link>
          </div>
          <div className={`${s.mastheadAside} ${s.mastheadAsideRight}`}>
            <div className={s.asideLabel}>Membership</div>
            <div className={s.asideValue}>FOUNDING WINDOW</div>
          </div>
        </div>
      </header>

      {/* ── Main nav ─────────────────────────────────────────────── */}
      <nav className={s.mainNav}>
        <div className={s.navInner}>
          <div className={s.navLinks}>
            <Link href="/"            className={s.navLink}>Home</Link>
            <Link href="/#news"       className={s.navLink}>Latest</Link>
            <Link href="/#regions"    className={s.navLink}>Regional</Link>
            <Link href="/#newsletter" className={s.navLink}>Briefing</Link>
            <Link href="/pricing"     className={`${s.navLink} ${s.navLinkActive}`}>Membership</Link>
          </div>
          <div className={s.liveIndicator}>
            <span className={s.liveDot} />
            <span>LIVE FEED</span>
          </div>
        </div>
      </nav>

      {/* ── Page content ─────────────────────────────────────────── */}
      <div className={s.pageWrap}>

        {/* Hero */}
        <section className={s.hero}>
          <div className={s.heroEyebrow}>Access Levels · Membership Tiers</div>
          <h1 className={s.heroTitle}>
            Choose Your <span className={s.heroAccent}>Vantage Point</span>
          </h1>
          <p className={s.heroLead}>
            Free conflict monitoring for Ukraine and the Middle East. Working analyst tools for
            individuals. Team and enterprise tiers arriving as we grow.
          </p>
        </section>

        {/* Founding banner */}
        <div className={s.foundingBanner}>
          <span className={s.foundingBadge}>Founding Members</span>
          <div className={s.foundingText}>
            The first <strong>250 Analyst subscribers</strong> lock in{" "}
            <strong>$12/mo</strong> for as long as their subscription stays active. After the
            founding window, Analyst is $25/mo.
          </div>
          <div className={s.foundingCounter}>
            <span className={s.foundingCount}>247 / 250</span>
            Spots remaining
          </div>
        </div>

        {/* ── Pricing grid ──────────────────────────────────────── */}
        <div className={s.grid}>

          {/* Watch */}
          <div className={s.card}>
            {tier === "watch" && <span className={s.cardTag}>Current Plan</span>}
            <div className={s.tierLabel}>Tier 01</div>
            <div className={s.tierName}>Watch</div>
            <div className={s.tierPrice}>
              <span className={s.priceCurrency}>$</span>0
              <span className={s.priceUnit}> / forever</span>
            </div>
            <div className={s.priceSecondary}>FREE ACCESS</div>
            <div className={s.priceStrike}>&nbsp;</div>
            <div className={s.tierDesc}>
              For anyone monitoring the space. Daily briefings, live dashboards, and the source
              feed — at no cost.
            </div>
            <ul className={s.features}>
              <li>Daily morning briefing by email</li>
              <li>Live dashboard: Ukraine + Middle East</li>
              <li>7-day rolling event window</li>
              <li>Today&rsquo;s AI theater briefing</li>
              <li>The Sentinel methodology white paper</li>
              <li>Best-effort email support</li>
            </ul>
            <div className={s.cardActions}>
              {userId ? (
                <Link href="/app/feed" className={s.tierCta}>Access Source Feed</Link>
              ) : (
                <Link href="/sign-up" className={s.tierCta}>Subscribe — Free</Link>
              )}
            </div>
          </div>

          {/* Analyst (featured) */}
          <div className={`${s.card} ${s.cardFeatured}`}>
            <span className={s.cardTag}>Founding Tier</span>
            <div className={s.tierLabel}>Tier 02</div>
            <div className={s.tierName}>Analyst</div>
            <div className={s.tierPrice}>
              <span className={s.priceCurrency}>$</span>12
              <span className={s.priceUnit}> / month</span>
            </div>
            <div className={s.priceSecondary}>OR $99 / YEAR · LOCKED IN</div>
            <div className={s.priceStrike}>Standard: <s>$25/mo · $249/yr</s></div>
            {hasAnalyst && sub?.current_period_end && (
              <div className={s.renewalNote}>
                {sub.status === "active" ? "Renews" : "Access until"}{" "}
                {sub.current_period_end.toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
                {sub.is_founding && " · Founding rate"}
              </div>
            )}
            <div className={s.tierDesc}>
              For working analysts, journalists, and researchers. Real alerts, full history, and
              the data you need to do your job.
            </div>
            <ul className={s.features}>
              <li className={s.everything}>Everything in Watch, plus:</li>
              <li>All theaters (Indo-Pacific, Africa, more coming)</li>
              <li>Full event history — queryable archive</li>
              <li>Custom alerts: topic, theater, geofence, threshold</li>
              <li>Weekly strategic assessment from the editor</li>
              <li>CSV / JSON data exports</li>
              <li>Read API access (1,000 calls/day)</li>
              <li>Embeddable widget for personal use</li>
              <li>Quarterly methodology webinars</li>
              <li>Discord community access</li>
              <li>Priority email support</li>
            </ul>
            <div className={s.cardActions}>
              {hasAnalyst ? (
                <>
                  <Link href="/app" className={`${s.tierCta} ${s.tierCtaPrimary}`}>
                    Access Dashboard
                  </Link>
                  <ManageBillingButton className={s.tierCta} />
                </>
              ) : !userId ? (
                <Link href="/sign-up" className={`${s.tierCta} ${s.tierCtaPrimary}`}>
                  Create Account to Subscribe
                </Link>
              ) : ANALYST_PRICE_MONTHLY ? (
                <>
                  <CheckoutButton
                    priceId={ANALYST_PRICE_MONTHLY}
                    className={`${s.tierCta} ${s.tierCtaPrimary}`}
                  >
                    Claim Founding Analyst
                  </CheckoutButton>
                  {ANALYST_PRICE_YEARLY && (
                    <CheckoutButton priceId={ANALYST_PRICE_YEARLY} className={s.tierCta}>
                      Subscribe Yearly — $99/yr (save 31%)
                    </CheckoutButton>
                  )}
                </>
              ) : (
                <Link href="/#newsletter" className={`${s.tierCta} ${s.tierCtaPrimary}`}>
                  Claim Founding Analyst
                </Link>
              )}
            </div>
          </div>

          {/* Bureau */}
          <div className={`${s.card} ${s.cardComing}`}>
            <span className={`${s.cardTag} ${s.cardTagComing}`}>Coming Soon</span>
            <div className={s.tierLabel}>Tier 03</div>
            <div className={s.tierName}>Bureau</div>
            <div className={s.tierPrice}>
              <span className={s.priceCurrency}>$</span>129
              <span className={s.priceUnit}> / month</span>
            </div>
            <div className={s.priceSecondary}>UP TO 10 SEATS · FROM $129/MO</div>
            <div className={s.priceStrike}>&nbsp;</div>
            <div className={s.tierDesc}>
              For newsrooms, NGO security teams, and small consultancies. Shared workspaces,
              team alerts, and a contact who answers.
            </div>
            <ul className={s.features}>
              <li className={s.everything}>Everything in Analyst, plus:</li>
              <li>3–10 team seats</li>
              <li>Shared workspaces and saved views</li>
              <li>Team alert rules + Slack/Teams integration</li>
              <li>Higher API limits (25K calls/day)</li>
              <li>Webhook support</li>
              <li>Newsroom embed license (unlimited widgets)</li>
              <li>1 custom briefing per month</li>
              <li>Named support contact + monthly office hours</li>
              <li>1 private team workshop per year</li>
            </ul>
            <div className={s.cardActions}>
              <a
                href="mailto:contact@thesentinelreview.com?subject=Notify%20me%20when%20Bureau%20launches"
                className={s.tierCta}
              >
                Notify Me at Launch
              </a>
            </div>
          </div>

        </div>{/* /grid */}

        {/* ── Comparison table ──────────────────────────────────── */}
        <section className={s.compareSection}>
          <div className={s.sectionLabel}>
            <h2 className={s.sectionLabelH2}>Full Comparison</h2>
            <div className={s.sectionLabelLine} />
            <div className={s.sectionLabelMeta}>All Features · All Tiers</div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.compareTable}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Watch<span className={s.priceMini}>Free</span></th>
                  <th>Analyst<span className={s.priceMini}>$12/mo founding</span></th>
                  <th>Bureau<span className={s.priceMini}>$129+/mo · coming</span></th>
                </tr>
              </thead>
              <tbody>
                {TABLE.map((row, i) =>
                  row.type === "group" ? (
                    <tr key={i} className={s.groupHeader}>
                      <td colSpan={4}>{row.label}</td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td>{row.label}</td>
                      <Cell v={row.watch} />
                      <Cell v={row.analyst} />
                      <Cell v={row.bureau} />
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className={s.faqSection}>
          <div className={s.sectionLabel}>
            <h2 className={s.sectionLabelH2}>Frequently Asked</h2>
            <div className={s.sectionLabelLine} />
            <div className={s.sectionLabelMeta}>FAQ</div>
          </div>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className={s.faqItem}>
              <h3 className={s.faqQ}>{item.q}</h3>
              <p className={s.faqA}>{item.a}</p>
            </div>
          ))}
        </section>

      </div>{/* /pageWrap */}

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className={s.finalCta}>
        <div className={s.finalCtaEyebrow}>Limited Founding Window</div>
        <h2 className={s.finalCtaTitle}>
          Start with <span className={s.finalCtaAccent}>Watch</span>. Upgrade when you&rsquo;re ready.
        </h2>
        <p className={s.finalCtaP}>
          Subscribe to the free morning briefing — no credit card, no friction. If the dashboard
          becomes part of how you work, claim your founding Analyst rate before the 250 spots are gone.
        </p>
        <div className={s.finalCtaButtons}>
          {userId ? (
            <Link href="/app/feed" className={s.btnPrimary}>Start with Watch — Free</Link>
          ) : (
            <Link href="/sign-up" className={s.btnPrimary}>Start with Watch — Free</Link>
          )}
          {hasAnalyst ? (
            <Link href="/app" className={s.btnSecondary}>Go to Dashboard →</Link>
          ) : ANALYST_PRICE_MONTHLY ? (
            <CheckoutButton priceId={ANALYST_PRICE_MONTHLY} className={s.btnSecondary}>
              Claim Founding Analyst →
            </CheckoutButton>
          ) : (
            <Link href="/#newsletter" className={s.btnSecondary}>Claim Founding Analyst →</Link>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className={s.footer}>
        <div className={s.autoNotice}>
          📡 AUTOMATED AGGREGATION — This site curates headlines from trusted national security
          sources. All stories link to original publishers.
        </div>
        <div className={s.footerGrid}>
          <div className={s.footerBrand}>
            <div className={s.footerLogoText}>
              The <span className={s.footerLogoAccent}>Sentinel</span> Review
            </div>
            <p className={s.footerBrandDesc}>
              Authoritative national security news aggregation and intelligence curation for
              policy makers and defense professionals.
            </p>
            <div className={s.followSection}>
              <div className={s.followLabel}>Follow Us</div>
              <div className={s.socialLinks}>
                <a className={s.socialLink} href="https://x.com/thesentinelrev" target="_blank" rel="noopener" title="Follow on X">X</a>
                <a className={s.socialLink} href="https://thesentinelreview.com/feed.xml" target="_blank" rel="noopener" title="RSS Feed">⊕</a>
              </div>
            </div>
            <div className={s.contactSection}>
              <div className={s.followLabel}>Contact</div>
              <a className={s.contactEmail} href="mailto:contact@thesentinelreview.com">
                contact@thesentinelreview.com
              </a>
            </div>
          </div>
          <div className={s.footerCol}>
            <h4 className={s.footerColHead}>Our Sources</h4>
            <ul className={s.footerColList}>
              {[
                ["https://www.defensenews.com",    "Defense News"],
                ["https://breakingdefense.com",     "Breaking Defense"],
                ["https://www.twz.com",             "The War Zone"],
                ["https://warontherocks.com",        "War on the Rocks"],
                ["https://www.defenseone.com",      "Defense One"],
                ["https://www.csis.org",            "CSIS"],
                ["https://www.atlanticcouncil.org", "Atlantic Council"],
                ["https://foreignpolicy.com",       "Foreign Policy"],
                ["https://www.foreignaffairs.com",  "Foreign Affairs"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener" className={s.footerColLink}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div className={s.footerCol}>
            <h4 className={s.footerColHead}>More Sources</h4>
            <ul className={s.footerColList}>
              {[
                ["https://www.cisa.gov",              "CISA"],
                ["https://www.stripes.com",            "Stars and Stripes"],
                ["https://www.lawfaremedia.org",       "Lawfare"],
                ["https://www.justsecurity.org",       "Just Security"],
                ["https://www.rand.org",               "RAND"],
                ["https://thediplomat.com",            "The Diplomat"],
                ["https://www.bellingcat.com",         "Bellingcat"],
                ["https://www.38north.org",            "38 North"],
                ["https://www.aspistrategist.org.au",  "ASPI Strategist"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener" className={s.footerColLink}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className={s.footerBottom}>
          <p>© {new Date().getFullYear()} Sentinel Media Group LLC · Columbus, Ohio</p>
          <p>All content links to original sources. Fair use for news aggregation.</p>
        </div>
      </footer>

    </div>
  );
}
