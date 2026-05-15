import TopBar from "@/components/TopBar";
import AlertQueue from "@/components/AlertQueue";
import ThreatTimeline from "@/components/ThreatTimeline";
import StatCounter from "@/components/StatCounter";
import ThreatMap from "@/components/ThreatMap";
import { getThreatMetrics, getAssets } from "@/lib/queries";

export const revalidate = 30;

export default async function TOCPage() {
  const [metrics, assets] = await Promise.all([
    getThreatMetrics(),
    getAssets(100),
  ]);

  // Map assets that have location data
  const mapAssets = assets
    .filter((a) => a.last_seen)
    .map((a) => ({
      id: a.id,
      lng: 0, lat: 0, // TODO: populate from PostGIS location column
      hostname: a.hostname,
      risk_score: a.risk_score,
      alert_count: 0,
    }));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      {/* ── Stat bar ─────────────────────────────────────────── */}
      <div
        className="flex gap-px shrink-0 border-b"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface)" }}
      >
        <StatCounter
          label="THREATS BLOCKED"
          value={metrics.blocked_total}
          color="var(--color-neon-green)"
          sublabel="all time"
        />
        <StatCounter
          label="OPEN ALERTS"
          value={metrics.open_alerts}
          color={metrics.critical_alerts > 0 ? "var(--color-neon-red)" : "var(--color-neon-amber)"}
          sublabel={`${metrics.critical_alerts} critical`}
        />
        <StatCounter
          label="ALERTS (24H)"
          value={metrics.alerts_24h}
          color="var(--color-neon-cyan)"
        />
        <StatCounter
          label="ACTIVE INCIDENTS"
          value={metrics.active_incidents}
          color="var(--color-neon-amber)"
        />
        <StatCounter
          label="ASSETS AT RISK"
          value={metrics.assets_at_risk}
          color="var(--color-neon-red)"
        />
        <StatCounter
          label="IOCs TRACKED"
          value={metrics.iocs_total}
          color="var(--color-neon-purple)"
        />
      </div>

      {/* ── Main grid ────────────────────────────────────────── */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: "1fr 320px 280px" }}>

        {/* Left: Threat Map */}
        <div
          className="flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--color-edge)" }}
        >
          <div
            className="px-3 py-1.5 border-b shrink-0"
            style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
          >
            <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
              THREAT OPERATIONS MAP
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ThreatMap assets={mapAssets} arcs={[]} />
          </div>
        </div>

        {/* Center: Alert queue */}
        <div
          className="flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--color-edge)", background: "var(--color-surface)" }}
        >
          <AlertQueue />
        </div>

        {/* Right: Timeline */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ background: "var(--color-surface)" }}
        >
          <ThreatTimeline maxItems={40} />
        </div>
      </div>

      {/* ── Asset status bar ─────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-4 h-8 border-t shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-faint)" }}>
          ENDPOINT STATUS
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-green)" }}>
          {assets.filter((a) => a.is_active).length} ONLINE
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-amber)" }}>
          {assets.filter((a) => a.risk_score > 50).length} AT RISK
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-red)" }}>
          {assets.filter((a) => a.risk_score > 80).length} CRITICAL
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[8px]" style={{ color: "var(--color-ink-faint)" }}>
          SHIELD v0.1.0 // AUTO-REFRESH 30s
        </span>
      </div>
    </div>
  );
}
