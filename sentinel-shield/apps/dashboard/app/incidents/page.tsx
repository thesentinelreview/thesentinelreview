import TopBar from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { getThreatMetrics, getIncidents } from "@/lib/queries";
import Link from "next/link";

export const revalidate = 15;

const STATUS_COLORS: Record<string, string> = {
  open:          "var(--color-neon-red)",
  investigating: "var(--color-neon-amber)",
  contained:     "var(--color-neon-cyan)",
  eradicated:    "var(--color-neon-green)",
  closed:        "var(--color-ink-muted)",
};

export default async function IncidentsPage() {
  const [metrics, incidents] = await Promise.all([getThreatMetrics(), getIncidents(50)]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}>
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          INCIDENT TRACKER // {incidents.length} INCIDENTS
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
          {incidents.map((incident) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`}>
              <div
                className="border p-4 hover:brightness-110 transition-all cursor-pointer"
                style={{
                  borderColor: "var(--color-edge)",
                  borderLeft: `3px solid ${STATUS_COLORS[incident.status] ?? "var(--color-edge)"}`,
                  background: "var(--color-surface)",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <SeverityBadge severity={incident.severity} size="xs" />
                  <span className="font-mono text-[8px] tracking-wider"
                    style={{ color: STATUS_COLORS[incident.status] }}>
                    {incident.status.toUpperCase()}
                  </span>
                </div>
                <div className="font-mono text-[11px] font-medium mb-1" style={{ color: "var(--color-ink)" }}>
                  {incident.title}
                </div>
                {incident.summary && (
                  <p className="font-sans text-[9px] line-clamp-2 mb-2" style={{ color: "var(--color-ink-muted)" }}>
                    {incident.summary}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px]" style={{ color: "var(--color-neon-purple)" }}>
                    {(incident as any).alert_count} ALERTS
                  </span>
                  <span className="font-mono text-[8px]" style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(incident.created_at).toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {incidents.length === 0 && (
          <div className="text-center font-mono text-sm mt-16" style={{ color: "var(--color-ink-faint)" }}>
            NO ACTIVE INCIDENTS
          </div>
        )}
      </div>
    </div>
  );
}
