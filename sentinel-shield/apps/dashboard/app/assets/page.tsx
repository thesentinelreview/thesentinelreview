import TopBar from "@/components/TopBar";
import { getThreatMetrics, getAssets } from "@/lib/queries";

export const revalidate = 30;

const OS_ICONS: Record<string, string> = {
  windows: "⊞",
  darwin:  "⌘",
  linux:   "🐧",
  unknown: "?",
};

const CRIT_COLORS: Record<string, string> = {
  critical: "var(--color-neon-red)",
  high:     "var(--color-neon-amber)",
  medium:   "var(--color-neon-cyan)",
  low:      "var(--color-ink-muted)",
};

export default async function AssetsPage() {
  const [metrics, assets] = await Promise.all([getThreatMetrics(), getAssets(200)]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          ASSET REGISTRY // {assets.length} ENDPOINTS
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr
              className="border-b sticky top-0"
              style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
            >
              {["OS", "HOSTNAME", "IP ADDRESS", "DEPARTMENT", "CRITICALITY", "RISK SCORE", "LAST SEEN", "STATUS"].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-mono text-[8px] tracking-widest"
                  style={{ color: "var(--color-ink-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.id}
                className="border-b hover:brightness-110 transition-colors"
                style={{ borderColor: "var(--color-edge)" }}
              >
                <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {OS_ICONS[asset.os_platform ?? "unknown"]}
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--color-ink)" }}>
                    {asset.hostname ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[10px]" style={{ color: "var(--color-neon-cyan)" }}>
                    {asset.ip_address ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-sans text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                    {asset.department ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[9px] tracking-wider"
                    style={{ color: CRIT_COLORS[asset.criticality] ?? "var(--color-ink-muted)" }}>
                    {asset.criticality.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 rounded-full flex-1" style={{
                      background: "var(--color-edge)",
                      maxWidth: 60,
                    }}>
                      <div className="h-full rounded-full" style={{
                        width: `${asset.risk_score}%`,
                        background: asset.risk_score > 80 ? "var(--color-neon-red)"
                          : asset.risk_score > 50 ? "var(--color-neon-amber)"
                          : "var(--color-neon-green)",
                      }} />
                    </div>
                    <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                      {asset.risk_score}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                    {asset.last_seen
                      ? new Date(asset.last_seen).toISOString().slice(0, 16).replace("T", " ")
                      : "never"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${asset.is_active ? "animate-pulse-green" : ""}`}
                      style={{ background: asset.is_active ? "var(--color-neon-green)" : "var(--color-ink-faint)" }} />
                    <span className="font-mono text-[9px]"
                      style={{ color: asset.is_active ? "var(--color-neon-green)" : "var(--color-ink-faint)" }}>
                      {asset.is_active ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
