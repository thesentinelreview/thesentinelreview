import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import CheckoutButton from "./CheckoutButton";

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_ANALYST_MONTHLY_PRICE_ID ?? "";
const YEARLY_PRICE_ID  = process.env.NEXT_PUBLIC_STRIPE_ANALYST_YEARLY_PRICE_ID  ?? "";

const WATCH_FEATURES = [
  "All 4 conflict theaters",
  "24h and 7d event windows",
  "Live event map",
  "Alerts feed",
  "Source reliability panel",
];

const ANALYST_FEATURES = [
  "Everything in Watch",
  "30-day event history",
  "Full briefing archive",
  "All time windows (24h / 7d / 30d)",
  "Map export",
  "Founding Analyst pricing — locked in",
];

const cell: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "28px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const featuredCell: React.CSSProperties = {
  ...cell,
  border: "1px solid var(--green)",
};

const tierLabel: React.CSSProperties = {
  fontFamily: "var(--font-cond-stack)",
  fontWeight: 700,
  fontSize: 13,
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
};

const price: React.CSSProperties = {
  fontFamily: "var(--font-cond-stack)",
  fontWeight: 600,
  fontSize: 36,
  lineHeight: 1,
  color: "var(--text)",
};

const priceUnit: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: 11,
  color: "var(--text-secondary)",
  marginTop: 4,
};

const featureList: React.CSSProperties = {
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  flex: 1,
};

const featureItem: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: 11,
  color: "var(--text-secondary)",
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
};

const dot: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--text-tertiary)",
  flexShrink: 0,
  marginTop: 5,
};

const okDot: React.CSSProperties = {
  ...dot,
  background: "var(--green)",
};

export default async function PricingPage() {
  const { userId } = await auth();
  const isSignedIn = !!userId;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "60px 20px",
        gap: 48,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", maxWidth: 540 }}>
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            textDecoration: "none",
            display: "block",
            marginBottom: 24,
          }}
        >
          ← Sentinel Review
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-cond-stack)",
            fontWeight: 700,
            fontSize: 28,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Analyst Access
        </h1>
        <p
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          Full history, all theaters, and briefing archive for the serious OSINT analyst.
        </p>
      </div>

      {/* Tier grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          width: "100%",
          maxWidth: 900,
        }}
      >
        {/* Watch — free */}
        <div style={cell}>
          <div>
            <div style={{ ...tierLabel, color: "var(--text-secondary)" }}>Watch</div>
            <div style={price}>Free</div>
            <div style={priceUnit}>always free</div>
          </div>
          <ul style={featureList}>
            {WATCH_FEATURES.map((f) => (
              <li key={f} style={featureItem}>
                <span style={dot} />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/"
            style={{
              display: "block",
              width: "100%",
              padding: "10px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono-stack)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textDecoration: "none",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            Open Dashboard
          </Link>
        </div>

        {/* Analyst — paid */}
        <div style={featuredCell}>
          <div>
            <div
              style={{
                ...tierLabel,
                color: "var(--green)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Analyst
              <span
                style={{
                  fontFamily: "var(--font-mono-stack)",
                  fontSize: 9,
                  padding: "2px 7px",
                  border: "1px solid var(--green)",
                  borderRadius: 2,
                  letterSpacing: "0.12em",
                  color: "var(--green)",
                  fontWeight: 400,
                }}
              >
                Founding
              </span>
            </div>
            <div style={price}>$12</div>
            <div style={priceUnit}>per month · or $99/yr (save 31%)</div>
          </div>
          <ul style={featureList}>
            {ANALYST_FEATURES.map((f) => (
              <li key={f} style={featureItem}>
                <span style={okDot} />
                <span style={{ color: "var(--text)" }}>{f}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <CheckoutButton
              priceId={MONTHLY_PRICE_ID}
              label="Claim Founding Analyst — $12/mo"
              isSignedIn={isSignedIn}
              primary
            />
            <CheckoutButton
              priceId={YEARLY_PRICE_ID}
              label="Annual — $99/yr"
              isSignedIn={isSignedIn}
            />
          </div>
        </div>

        {/* Bureau — enterprise */}
        <div style={cell}>
          <div>
            <div style={{ ...tierLabel, color: "var(--text-secondary)" }}>Bureau</div>
            <div style={price}>Custom</div>
            <div style={priceUnit}>team + enterprise</div>
          </div>
          <ul style={featureList}>
            <li style={featureItem}><span style={dot} />Everything in Analyst</li>
            <li style={featureItem}><span style={dot} />Team seats</li>
            <li style={featureItem}><span style={dot} />API access</li>
            <li style={featureItem}><span style={dot} />Custom asset overlays</li>
            <li style={featureItem}><span style={dot} />Priority support</li>
          </ul>
          <a
            href="mailto:hello@thesentinelreview.com"
            style={{
              display: "block",
              width: "100%",
              padding: "10px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
              color: "var(--text)",
              fontFamily: "var(--font-mono-stack)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textDecoration: "none",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            Contact Us
          </a>
        </div>
      </div>

      {/* Footer note */}
      <p
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          textAlign: "center",
        }}
      >
        Secure checkout via Stripe · Cancel anytime
      </p>
    </div>
  );
}
