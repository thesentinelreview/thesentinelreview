import SiteNav from "@/components/SiteNav";
import s from "./page.module.css";

export const metadata = {
  title: "Verification Methodology — Sentinel Review",
};

export default function MethodologyPage() {
  return (
    <div className={s.page}>
      <SiteNav />

      <div className={s.header}>
        <div className={s.title}>Verification methodology</div>
        <div className={s.subtitle}>
          How Sentinel Review assesses, labels, and presents conflict events
        </div>
      </div>

      {/* Confidence levels */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Confidence levels</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.confCard}>
            <div className={s.confLeft}>
              <div className={`${s.confBadge} ${s.confVerified}`}>● Verified</div>
            </div>
            <div>
              <div className={s.confDefinition}>
                The event is corroborated by at least two independent sources from different platforms or
                organisations, and at least one of the following: geolocated footage, official acknowledgment,
                or matching local press wire.
              </div>
              <div className={s.confCriteria}>
                ≥2 independent sources, different platforms<br />
                + geolocation OR official acknowledgment OR wire corroboration
              </div>
            </div>
          </div>

          <div className={s.confCard}>
            <div className={s.confLeft}>
              <div className={`${s.confBadge} ${s.confPartial}`}>◐ Partial</div>
            </div>
            <div>
              <div className={s.confDefinition}>
                Multiple sources exist but all are from the same platform, or a single verified-tier source
                is paired with one corroborating circumstantial signal. The event likely occurred but cannot
                be fully confirmed.
              </div>
              <div className={s.confCriteria}>
                ≥2 sources, same platform<br />
                OR tier-1 source + one corroborating signal
              </div>
            </div>
          </div>

          <div className={s.confCard}>
            <div className={s.confLeft}>
              <div className={`${s.confBadge} ${s.confUnconfirmed}`}>○ Unconfirmed</div>
            </div>
            <div>
              <div className={s.confDefinition}>
                A single source, or multiple sources that trace back to a common origin (e.g. all citing the
                same Telegram channel). Published for awareness; treat all unconfirmed events with
                significant caution.
              </div>
              <div className={s.confCriteria}>
                Single source<br />
                OR multiple sources with common origin
              </div>
            </div>
          </div>

          <div className={s.warningBox}>
            <strong>High-impact hold:</strong> Events flagged by the extraction pipeline as involving
            mass casualties, nuclear or chemical signals, or significant escalatory steps are held in the
            human review queue regardless of source count. They do not appear on the live map until a
            human reviewer approves them.
          </div>
        </div>
      </div>

      {/* Source trust tiers */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Source trust tiers</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.prose}>
            <p>
              Every source in the system is assigned a trust tier by a human editor. Tiers affect how much
              weight a source's posts receive in confidence scoring — a tier-1 source posting alone can reach
              <em> partial</em> confidence; a tier-3 source posting alone stays <em>unconfirmed</em>.
            </p>
          </div>
          <div>
            <div className={s.tierRow}>
              <div className={`${s.tierNum} ${s.tierNum1}`}>Tier 1</div>
              <div>
                <div className={s.tierLabel}>High trust</div>
                <div className={s.tierDesc}>
                  Verified investigative accounts with established geolocation track records, major international
                  wire services (Reuters, AFP, AP), and peer-reviewed OSINT projects with transparent methodology.
                  Examples: @DefMon3, @OSINTtechnical, Reuters Wire.
                </div>
              </div>
            </div>
            <div className={s.tierRow}>
              <div className={`${s.tierNum} ${s.tierNum2}`}>Tier 2</div>
              <div>
                <div className={s.tierLabel}>Medium trust</div>
                <div className={s.tierDesc}>
                  Established mapping or conflict accounts with a good verification track record but less
                  transparent methodology, regional press with known editorial stances, and community
                  geolocation projects. Require corroboration before reaching <em>verified</em>.
                </div>
              </div>
            </div>
            <div className={s.tierRow}>
              <div className={`${s.tierNum} ${s.tierNum3}`}>Tier 3</div>
              <div>
                <div className={s.tierLabel}>Low trust</div>
                <div className={s.tierDesc}>
                  Anonymous accounts, state-affiliated media, single-contributor Telegram milblogs, and sources
                  with known track records of amplifying unverified or false information. High volume but low
                  signal. Never sufficient alone for any confidence level above <em>unconfirmed</em>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Event processing pipeline</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.pipeline}>
            <div className={s.pipeStep}>
              <div className={s.pipeNum}>1</div>
              <div>
                <div className={s.pipeTitle}>Ingestion</div>
                <div className={s.pipeDesc}>
                  Posts are collected from curated source feeds (X, Telegram public channels, RSS, wire
                  services) at regular intervals. Every post is stored verbatim in an append-only log and
                  never mutated.
                </div>
              </div>
            </div>
            <div className={s.pipeStep}>
              <div className={s.pipeNum}>2</div>
              <div>
                <div className={s.pipeTitle}>Entity extraction</div>
                <div className={s.pipeDesc}>
                  An LLM (Claude) analyzes each post and extracts: event type, location, approximate time,
                  actor (if identifiable), and a brief description. Posts without a discrete conflict event
                  are discarded. Extraction output is structured JSON — the model cannot free-text outside
                  the schema.
                </div>
              </div>
            </div>
            <div className={s.pipeStep}>
              <div className={s.pipeNum}>3</div>
              <div>
                <div className={s.pipeTitle}>Deduplication and clustering</div>
                <div className={s.pipeDesc}>
                  Candidate events within 15 km and 2 hours of each other are clustered as potential
                  duplicates. A second LLM pass decides whether two candidates describe the same event or
                  distinct events. Merged candidates inherit all source links.
                </div>
              </div>
            </div>
            <div className={s.pipeStep}>
              <div className={s.pipeNum}>4</div>
              <div>
                <div className={s.pipeTitle}>Confidence scoring</div>
                <div className={s.pipeDesc}>
                  Each event is scored using the rules above. Source trust tiers are applied as weights.
                  The confidence label shown on the map is deterministic from the rule set — not a
                  probabilistic output of a model.
                </div>
              </div>
            </div>
            <div className={s.pipeStep}>
              <div className={s.pipeNum}>5</div>
              <div>
                <div className={s.pipeTitle}>Human review queue</div>
                <div className={s.pipeDesc}>
                  High-impact events and events with a contradicting source are held for human review before
                  publication. A reviewer can upgrade or downgrade confidence, add notes, or reject the event
                  entirely. The reviewer&apos;s decision and notes are published alongside the event.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content warnings */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Content and graphic material</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.prose}>
            <p>
              Sentinel Review does not embed media directly. Source links open in a new tab and may contain
              graphic content including footage of combat, casualties, and infrastructure destruction.
              Every source link is accompanied by a content warning.
            </p>
            <p>
              Screenshots of source posts are stored in object storage for archival purposes (in case the
              original is deleted or modified) but are not displayed by default. They are available on the
              event detail page behind an explicit expand action.
            </p>
          </div>
        </div>
      </div>

      {/* Error reporting */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>Errors and corrections</div>
        </div>
        <div className={s.sectionBody}>
          <div className={s.prose}>
            <p>
              <strong>Every event page has a &ldquo;Report this event&rdquo; link.</strong> If you believe an
              event is incorrectly located, mislabeled, or based on fabricated sources, use that link. Reports
              go directly to the editorial queue and are reviewed within 24 hours.
            </p>
            <p>
              Corrections are published openly in the event&apos;s change history. Confidence can only go
              down, not up, once a credible dispute has been filed.
            </p>
          </div>
          <div className={s.reportLink}>
            To report an event error: use the &ldquo;Report&rdquo; link on the event page, or email{" "}
            <a href="mailto:corrections@thesentinelreview.com">corrections@thesentinelreview.com</a>
          </div>
        </div>
      </div>

    </div>
  );
}
