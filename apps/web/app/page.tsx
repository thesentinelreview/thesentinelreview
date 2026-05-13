import Link from "next/link";
import s from "./page.module.css";
import MapWrapper from "@/components/MapWrapper";
import { type Alert, resolveTheater, THEATERS } from "@/data/placeholder";
import {
  getStats,
  getMapEvents,
  getAlerts,
  getIntensity,
  getTopSources,
  getLatestBriefing,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m ago` : `${h}h ago`;
}

function confidenceLabel(c: Alert["confidence"]): string {
  return c === "verified" ? "VERIFIED" : c === "partial" ? "PARTIAL" : "UNCONFIRMED";
}

function alertMarkerClass(e: Alert["event_type"]): string {
  if (e === "strike")  return s.alertMarkerRed;
  if (e === "clash")   return s.alertMarkerAmber;
  return s.alertMarkerBlue;
}

function nowUTC(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ theater?: string }>;
}) {
  const params = await searchParams;
  const theater = resolveTheater(params.theater);

  const [stats, mapEvents, alerts, intensity, sources, briefing] = await Promise.all([
    getStats(theater.id),
    getMapEvents(theater.id),
    getAlerts(theater.id),
    getIntensity(theater.id),
    getTopSources(theater.id),
    getLatestBriefing(theater.id),
  ]);

  return (
    <div className={s.app}>

      {/* TOP BAR */}
      <div className={s.topbar}>
        <div className={s.brand}>
          <div className={s.brandLogo} />
          <div className={s.brandName}>Sentinel Review</div>
          <div className={s.brandDivider}>/</div>
          <div className={s.brandSection}>Conflict Intelligence — Live Map</div>
          <span className={s.betaChip}>Beta</span>
        </div>
        <div className={s.filters}>
          <span className={s.filterLabel}>Theater</span>
          {(Object.values(THEATERS)).map((t) => (
            <Link
              key={t.id}
              href={`/?theater=${t.id}`}
              className={`${s.filterChip} ${theater.id === t.id ? s.filterChipActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
          <span className={s.filterLabel} style={{ marginLeft: 6 }}>Window</span>
          <span className={`${s.filterChip} ${s.filterChipActive}`}>24h ▾</span>
          <div className={s.liveIndicator}>
            <span className={s.liveDot} />
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className={s.main}>

        {/* MAP */}
        <div className={s.mapCard}>
          <div className={s.mapHeader}>
            <div className={s.mapTitle}>{theater.mapSubtitle}</div>
            <div className={s.mapMeta}>
              <span><strong>{stats.events}</strong> events</span>
              <span><strong>{stats.strikes}</strong> strikes</span>
              <span><strong>{Math.max(0, stats.events - stats.strikes)}</strong> movements</span>
            </div>
          </div>

          <div className={s.mapCanvas}>
            <MapWrapper events={mapEvents} center={theater.mapCenter} zoom={theater.mapZoom} />

            <div className={`${s.mapOverlay} ${s.mapLegend}`}>
              <div className={s.legendItem}>
                <span className={s.legendDot} style={{ background: "#e63946" }}/>
                <span>Strike / impact</span>
              </div>
              <div className={s.legendItem}>
                <span className={s.legendDot} style={{ background: "#f4a261" }}/>
                <span>Contact / clash</span>
              </div>
              <div className={s.legendItem}>
                <span className={s.legendDot} style={{ background: "#5b9eff" }}/>
                <span>Movement</span>
              </div>
            </div>
          </div>

          {/* Time scrubber */}
          <div className={s.scrubber}>
            <span className={s.scrubberTime}>−24h</span>
            <div className={s.scrubberTrack}>
              <div className={s.scrubberFill}/>
              <div className={s.scrubberHandle}/>
            </div>
            <span className={s.scrubberTime}>{nowUTC()}</span>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className={s.rail}>

          {/* At a glance */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>At a glance</div>
              <div className={s.panelMeta}>Past 24h</div>
            </div>
            <div className={s.statsGrid}>
              <div className={s.stat}>
                <div className={s.statLabel}>Events</div>
                <div className={s.statValue}>{stats.events}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Strikes</div>
                <div className={s.statValue}>{stats.strikes}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Verified</div>
                <div className={s.statValue}>
                  {stats.verified_pct}<span className={s.statUnit}>%</span>
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>vs 7d avg</div>
                <div className={`${s.statValue} ${stats.vs_7d_avg_pct >= 0 ? s.statValueUp : ""}`}>
                  <span className={s.statArrow}>{stats.vs_7d_avg_pct >= 0 ? "↑" : "↓"}</span>
                  {Math.abs(stats.vs_7d_avg_pct)}<span className={s.statUnit}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Intensity — 7d */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Intensity — 7d</div>
              <div className={s.panelMeta}>events / day</div>
            </div>
            <div className={s.intensity}>
              <div className={s.intensityChart}>
                {intensity.map((d) => (
                  <div
                    key={d.label}
                    className={`${s.bar} ${d.hot ? s.barHot : ""}`}
                    style={{ height: `${d.value}%` }}
                  />
                ))}
              </div>
              <div className={s.dayLabels}>
                {intensity.map((d) => <span key={d.label}>{d.label}</span>)}
              </div>
            </div>
          </div>

          {/* Active alerts */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Active alerts</div>
              <div className={s.panelMeta}>{alerts.length} active</div>
            </div>
            <div className={s.alerts}>
              {alerts.length === 0 ? (
                <div style={{ padding: "16px", fontFamily: "var(--font-mono-stack)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>
                  No active alerts
                </div>
              ) : (
                alerts.map((a) => (
                  <Link key={a.id} href={`/event/${a.id}`} className={s.alertItem} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className={`${s.alertMarker} ${alertMarkerClass(a.event_type)}`}/>
                    <div className={s.alertBody}>
                      <div className={s.alertTitle}>{a.title}</div>
                      <div className={s.alertMeta}>
                        {a.source_count} source{a.source_count !== 1 ? "s" : ""} ·{" "}
                        <span className={a.confidence === "verified" ? s.verified : undefined}>
                          {confidenceLabel(a.confidence)}
                        </span>
                        {" "}· {fmtMinutes(a.minutes_ago)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className={s.bottom}>

        {/* Daily briefing */}
        <div className={s.briefing}>
          <div className={s.briefingHeader}>
            <div className={s.briefingTitle}>{theater.briefingTitle}</div>
            <div className={s.briefingActions}>
              <span className={s.badge}>{briefing?.reviewed ? "REVIEWED" : "AI DRAFT"}</span>
              {briefing && (
                <Link href={`/briefing/${briefing.id}`} className={`${s.badge} ${s.badgeAction}`} style={{ textDecoration: "none" }}>
                  OPEN ↗
                </Link>
              )}
            </div>
          </div>
          {briefing ? (
            <>
              <div className={s.briefingByline}>
                {briefing.date} · {briefing.utc_time} · Compiled from {briefing.source_count} sources
              </div>
              <div className={s.briefingBody}>
                {briefing.paragraphs.map((p, i) => (
                  <p key={i}>
                    {i === briefing.paragraphs.length - 1 ? (
                      <>{p} <Link href={`/briefing/${briefing.id}`} className={s.briefingLink}>See full briefing →</Link></>
                    ) : p}
                  </p>
                ))}
              </div>
              <div className={s.briefingDisclaimer}>
                ⚠ AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.
              </div>
            </>
          ) : (
            <div className={s.briefingByline} style={{ borderBottom: "none", paddingBottom: 0 }}>
              No briefing has been generated yet
            </div>
          )}
        </div>

        {/* Top sources */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <div className={s.panelTitle}>Top sources today</div>
            <div className={s.panelMeta}>cross-ref&apos;d · verif. rate</div>
          </div>
          <div className={s.sourcesList}>
            {sources.length === 0 ? (
              <div style={{ padding: "16px", fontFamily: "var(--font-mono-stack)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>
                No source activity yet
              </div>
            ) : (
              sources.map((src) => (
                <div key={src.rank} className={s.sourceRow}>
                  <span className={s.sourceRank}>{String(src.rank).padStart(2, "0")}</span>
                  <span className={s.sourceName}>{src.display_name}</span>
                  <span className={s.sourceCount}>{src.events_count}</span>
                  <span className={`${s.sourceRate} ${src.verified_rate >= 80 ? s.sourceRateHigh : s.sourceRateMid}`}>
                    {src.verified_rate}%
                  </span>
                </div>
              ))
            )}
          </div>
          <div className={s.sourcesFooter}>Cross-referenced sources · Verification rate over rolling 30 days</div>
        </div>

      </div>
    </div>
  );
}
