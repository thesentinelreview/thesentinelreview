import SiteNav from "@/components/SiteNav";
import s from "./page.module.css";

export const metadata = {
  title: "About — Sentinel Review",
};

export default function AboutPage() {
  return (
    <div className={s.page}>
      <SiteNav />

      <div className={s.header}>
        <div className={s.title}>About Sentinel Review</div>
        <div className={s.subtitle}>
          A public, free conflict intelligence dashboard for the OSINT community
        </div>
      </div>

      {/* What this is */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>What this is</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.prose}>
            <p>
              Sentinel Review aggregates, verifies, and presents conflict events from open sources, with
              AI-generated daily briefings on top. The closest reference points are Liveuamap (real-time but
              shallow), ACLED (rigorous but slow), and ISW daily assessments (analytically strong but static
              prose). This product sits between them: fast like Liveuamap, analytically credible like ACLED,
              more interactive than ISW.
            </p>
            <p>
              <strong>v0.1 covers a single theater: Ukraine, eastern oblasts.</strong> The map shows three
              event types (strikes, clashes, movements) with confidence labels on every event. Every event
              is traceable to its sources and shows a full audit trail. The AI daily briefing is always
              labeled as a draft until a human reviews it.
            </p>
          </div>
          <div className={s.principles}>
            <div className={s.principle}>
              <div className={s.principleTitle}>Verification first</div>
              <div className={s.principleText}>
                Confidence labels are deterministic from source counts and tiers, not a model&apos;s guess.
                When in doubt, the label goes down.
              </div>
            </div>
            <div className={s.principle}>
              <div className={s.principleTitle}>Transparent sources</div>
              <div className={s.principleText}>
                Every event shows its full source list, platform badges, and the relationship each source
                has to the event (primary, corroborating, contradicting).
              </div>
            </div>
            <div className={s.principle}>
              <div className={s.principleTitle}>No operational use</div>
              <div className={s.principleText}>
                This tool is for situational awareness and open-source analysis only. Nothing here supports
                targeting, tasking, or operational decision-making.
              </div>
            </div>
            <div className={s.principle}>
              <div className={s.principleTitle}>Open corrections</div>
              <div className={s.principleText}>
                Corrections are published in each event&apos;s change history. The correction record is
                permanent and visible to everyone.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What this is not */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>What this is not</div>
        </div>
        <div className={s.sectionBody}>
          <ul className={s.notList}>
            <li>A real-time feed — events are processed and verified before appearing on the map.</li>
            <li>An authoritative record — it is an OSINT aggregation tool, not a primary source.</li>
            <li>Complete — only events that pass through the ingestion pipeline are shown. Many events go unreported by monitored sources.</li>
            <li>Impartial by design — sources have known editorial stances. Trust tiers and source attribution are our mitigations, not a guarantee of neutrality.</li>
            <li>A targeting or intelligence tool — we actively decline to build features that would support operational military use.</li>
          </ul>
        </div>
      </div>

      {/* Who runs it */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Who runs it</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.prose}>
            <p>
              Sentinel Review is an independent project run by <strong>Jacob</strong>. It has no institutional
              affiliation, no government funding, and no relationship with any military or intelligence
              organisation. The source code for the ingestion pipeline methodology is documented publicly at{" "}
              <a href="/methodology">/methodology</a>.
            </p>
            <p>
              The product is free and public. Future tiers may add additional features for professional
              analysts, but the core map, briefings, and source data will remain free and openly accessible.
            </p>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Contact</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.contactList}>
            <div className={s.contactRow}>
              <div className={s.contactLabel}>General</div>
              <div className={s.contactValue}>
                <a href="mailto:hello@thesentinelreview.com">hello@thesentinelreview.com</a>
              </div>
            </div>
            <div className={s.contactRow}>
              <div className={s.contactLabel}>Corrections</div>
              <div className={s.contactValue}>
                <a href="mailto:corrections@thesentinelreview.com">corrections@thesentinelreview.com</a>
              </div>
            </div>
            <div className={s.contactRow}>
              <div className={s.contactLabel}>Source tips</div>
              <div className={s.contactValue}>
                <a href="mailto:sources@thesentinelreview.com">sources@thesentinelreview.com</a>
              </div>
            </div>
            <div className={s.contactRow}>
              <div className={s.contactLabel}>Press</div>
              <div className={s.contactValue}>Use the general address above</div>
            </div>
          </div>
        </div>
      </div>

      {/* Version */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Version</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.versionRow}>
            <div className={s.versionItem}>
              <div className={s.versionLabel}>Product version</div>
              <div className={s.versionValue}>v0.1 (MVP)</div>
            </div>
            <div className={s.versionItem}>
              <div className={s.versionLabel}>Theater</div>
              <div className={s.versionValue}>Ukraine — Eastern</div>
            </div>
            <div className={s.versionItem}>
              <div className={s.versionLabel}>Sources tracked</div>
              <div className={s.versionValue}>8 active</div>
            </div>
            <div className={s.versionItem}>
              <div className={s.versionLabel}>Launched</div>
              <div className={s.versionValue}>May 2026</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
