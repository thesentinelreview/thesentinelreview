import s from "./page.module.css";
import {
  stats,
  mapEvents,
  alerts,
  intensity,
  sources,
  briefing,
  type Alert,
  type MapEvent,
} from "@/data/placeholder";

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

// ── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className={s.app}>

      {/* TOP BAR */}
      <div className={s.topbar}>
        <div className={s.brand}>
          <div className={s.brandLogo} />
          <div className={s.brandName}>Sentinel Review</div>
          <div className={s.brandDivider}>/</div>
          <div className={s.brandSection}>Conflict Intelligence — Live Map</div>
        </div>
        <div className={s.filters}>
          <span className={s.filterLabel}>Theater</span>
          <span className={`${s.filterChip} ${s.filterChipActive}`}>Ukraine ▾</span>
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
            <div className={s.mapTitle}>Eastern Theater — Donetsk / Luhansk Oblasts</div>
            <div className={s.mapMeta}>
              <span><strong>{stats.events}</strong> events</span>
              <span><strong>{stats.strikes}</strong> strikes</span>
              <span><strong>{stats.events - stats.strikes}</strong> movements</span>
            </div>
          </div>

          <div className={s.mapCanvas}>
            <svg className={s.mapSvg} viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="800" height="480" fill="url(#grid)"/>

              {/* Land mass — stylized eastern Ukraine */}
              <path
                d="M 50 80 Q 120 60 200 70 L 280 65 Q 360 75 440 95 L 520 110 Q 600 130 660 170 L 700 220 L 720 280 L 700 340 L 660 390 L 580 420 L 480 425 L 380 410 L 290 380 L 220 340 L 160 290 L 110 230 L 70 170 Z"
                fill="#1d1f25" stroke="#2e3038" strokeWidth="1"
              />

              {/* Rivers */}
              <path d="M 200 70 Q 230 150 280 220 Q 310 290 350 360 Q 380 410 420 425"
                fill="none" stroke="#2e3038" strokeWidth="1.5" opacity="0.7"/>
              <path d="M 440 95 Q 460 180 480 260 Q 490 340 480 425"
                fill="none" stroke="#2e3038" strokeWidth="1" opacity="0.5"/>

              {/* Front line */}
              <path d="M 380 105 Q 410 150 430 200 Q 460 250 480 300 Q 500 360 510 410"
                fill="none" stroke="#5a5a5a" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7"/>

              {/* Oblast labels */}
              <text x="280" y="200" fontFamily="IBM Plex Mono" fontSize="9" fill="#5d5c58" letterSpacing="2">KHARKIV</text>
              <text x="380" y="280" fontFamily="IBM Plex Mono" fontSize="9" fill="#5d5c58" letterSpacing="2">DONETSK</text>
              <text x="540" y="200" fontFamily="IBM Plex Mono" fontSize="9" fill="#5d5c58" letterSpacing="2">LUHANSK</text>

              {/* Cities */}
              <g fontFamily="IBM Plex Mono" fontSize="9" fill="#8a8780">
                <circle cx="320" cy="180" r="2" fill="#8a8780"/><text x="328" y="184">Izium</text>
                <circle cx="430" cy="260" r="2" fill="#8a8780"/><text x="438" y="264">Kramatorsk</text>
                <circle cx="450" cy="320" r="2" fill="#8a8780"/><text x="458" y="324">Pokrovsk</text>
                <circle cx="540" cy="280" r="2" fill="#8a8780"/><text x="548" y="284">Bakhmut</text>
                <circle cx="270" cy="120" r="2" fill="#8a8780"/><text x="278" y="124">Kupiansk</text>
              </g>

              {/* Event pins */}
              {mapEvents.map((evt) => <EventPin key={evt.id} evt={evt} />)}
            </svg>

            {/* Hover popover — Pokrovsk strike cluster */}
            <div className={s.mapPopover}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <div className={s.popoverLabel}>Strike — Pokrovsk Axis</div>
                <div className={s.popoverVerified}>● Verified</div>
              </div>
              <div className={s.popoverDesc}>7 reported impacts on industrial site, civilian infrastructure damaged.</div>
              <div className={s.popoverFooter}>
                <span>3 sources · 18m ago</span>
                <span>View →</span>
              </div>
            </div>

            <div className={`${s.mapOverlay} ${s.mapCoordsTicker}`}>
              48.2829° N · 37.1779° E
            </div>

            <div className={`${s.mapOverlay} ${s.mapZoom}`}>
              <button>+</button>
              <button>−</button>
            </div>

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
            <span className={s.scrubberTime}>14:42 UTC</span>
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
                <div className={`${s.statValue} ${s.statValueUp}`}>
                  <span className={s.statArrow}>↑</span>
                  {stats.vs_7d_avg_pct}<span className={s.statUnit}>%</span>
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
              {alerts.map((a) => (
                <div key={a.id} className={s.alertItem}>
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
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className={s.bottom}>

        {/* Daily briefing */}
        <div className={s.briefing}>
          <div className={s.briefingHeader}>
            <div className={s.briefingTitle}>Daily Briefing — Eastern Theater</div>
            <div className={s.briefingActions}>
              <span className={s.badge}>AI DRAFT</span>
              <span className={`${s.badge} ${s.badgeAction}`}>EMBED ↗</span>
              <span className={`${s.badge} ${s.badgeAction}`}>EXPORT</span>
            </div>
          </div>
          <div className={s.briefingByline}>
            {briefing.date} · {briefing.utc_time} · Compiled from {briefing.source_count} sources ·{" "}
            {briefing.reviewed ? "Reviewed" : "AI Draft"}
          </div>
          <div className={s.briefingBody}>
            {briefing.paragraphs.map((p, i) => (
              <p key={i}>
                {i === briefing.paragraphs.length - 1 ? (
                  <>{p} <a href="#" className={s.briefingLink}>See full briefing →</a></>
                ) : p}
              </p>
            ))}
          </div>
        </div>

        {/* Top sources */}
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <div className={s.panelTitle}>Top sources today</div>
            <div className={s.panelMeta}>events · verified rate</div>
          </div>
          <div className={s.sourcesList}>
            {sources.map((src) => (
              <div key={src.rank} className={s.sourceRow}>
                <span className={s.sourceRank}>{String(src.rank).padStart(2, "0")}</span>
                <span className={s.sourceName}>{src.display_name}</span>
                <span className={s.sourceCount}>{src.events_count}</span>
                <span className={`${s.sourceRate} ${src.verified_rate >= 80 ? s.sourceRateHigh : s.sourceRateMid}`}>
                  {src.verified_rate}%
                </span>
              </div>
            ))}
          </div>
          <div className={s.sourcesFooter}>Verification rate over rolling 30 days</div>
        </div>

      </div>
    </div>
  );
}

// ── EventPin: renders a single map event as SVG circles ───────────────────────

function pinColor(type: MapEvent["event_type"]): string {
  if (type === "strike") return "#e63946";
  if (type === "clash")  return "#f4a261";
  return "#5b9eff";
}

function pinColorDim(type: MapEvent["event_type"]): string {
  if (type === "strike") return "rgba(230,57,70,0.15)";
  if (type === "clash")  return "rgba(244,162,97,0.15)";
  return "rgba(91,158,255,0.15)";
}

function pinColorMid(type: MapEvent["event_type"]): string {
  if (type === "strike") return "rgba(230,57,70,0.35)";
  if (type === "clash")  return "rgba(244,162,97,0.35)";
  return "rgba(91,158,255,0.35)";
}

function EventPin({ evt }: { evt: MapEvent }) {
  const color    = pinColor(evt.event_type);
  const colorDim = pinColorDim(evt.event_type);
  const colorMid = pinColorMid(evt.event_type);
  const r        = evt.radius;
  const cx       = evt.svg_x;
  const cy       = evt.svg_y;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={colorDim}/>
      {r >= 10 && <circle cx={cx} cy={cy} r={r - 6} fill={colorMid}/>}
      <circle cx={cx} cy={cy} r={Math.max(2, r - 10)} fill={color}/>
    </g>
  );
}
