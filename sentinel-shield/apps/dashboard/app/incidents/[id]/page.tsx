import TopBar from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { getThreatMetrics, getIncident, getIncidentAlerts } from "@/lib/queries";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const revalidate = 10;

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [metrics, incident, alerts] = await Promise.all([
    getThreatMetrics(),
    getIncident(id),
    getIncidentAlerts(id),
  ]);

  if (!incident) notFound();

  const mitreChain = alerts
    .filter((a) => a.mitre_technique)
    .map((a) => a.mitre_technique as string)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      {/* Incident header */}
      <div className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}>
        <div className="flex items-center gap-3 mb-1">
          <SeverityBadge severity={incident.severity} />
          <span className="font-mono text-[9px] tracking-wider px-2 py-0.5"
            style={{ color: "var(--color-neon-amber)", background: "var(--color-neon-amber-dim)" }}>
            {incident.status.toUpperCase()}
          </span>
        </div>
        <h1 className="font-condensed text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
          {incident.title}
        </h1>
        <div className="flex items-center gap-4 mt-1">
          <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
            {new Date(incident.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
          </span>
          <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-purple)" }}>
            {alerts.length} ALERTS
          </span>
          {incident.assigned_to && (
            <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
              ASSIGNED: {incident.assigned_to}
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: AI Analysis */}
        <div className="flex-1 overflow-y-auto p-6 border-r" style={{ borderColor: "var(--color-edge)" }}>
          {mitreChain.length > 0 && (
            <div className="mb-6">
              <div className="font-mono text-[9px] tracking-widest mb-2"
                style={{ color: "var(--color-ink-muted)" }}>MITRE ATT&CK CHAIN</div>
              <div className="flex items-center gap-2 flex-wrap">
                {mitreChain.map((t, i) => (
                  <span key={t}>
                    <span className="font-mono text-xs px-2 py-1"
                      style={{ color: "var(--color-neon-cyan)", background: "var(--color-neon-cyan-dim)", border: "1px solid var(--color-neon-cyan)30" }}>
                      {t}
                    </span>
                    {i < mitreChain.length - 1 && (
                      <span className="font-mono text-xs mx-1" style={{ color: "var(--color-ink-faint)" }}>→</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {incident.ai_analysis ? (
            <div className="prose prose-sm max-w-none"
              style={{ "--tw-prose-body": "var(--color-ink)", "--tw-prose-headings": "var(--color-neon-cyan)" } as any}>
              <div className="font-mono text-[9px] tracking-widest mb-3"
                style={{ color: "var(--color-neon-purple)" }}>
                ◈ AI INVESTIGATION REPORT // CLAUDE OPUS
              </div>
              <div className="font-sans text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {incident.ai_analysis}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="font-mono text-sm" style={{ color: "var(--color-ink-faint)" }}>
              AI ANALYSIS PENDING...
            </div>
          )}
        </div>

        {/* Right: Alert timeline */}
        <div className="w-80 overflow-y-auto shrink-0">
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-edge)" }}>
            <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
              ALERT TIMELINE
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-edge)" }}>
            {alerts.map((alert) => (
              <div key={alert.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <SeverityBadge severity={alert.severity} size="xs" />
                  <span className="font-mono text-[8px]" style={{ color: "var(--color-ink-faint)" }}>
                    {new Date(alert.occurred_at).toISOString().slice(11, 19)}
                  </span>
                </div>
                <div className="font-mono text-[9px] mt-1 leading-snug" style={{ color: "var(--color-ink)" }}>
                  {alert.title}
                </div>
                {alert.ai_summary && (
                  <div className="font-sans text-[8px] mt-1 line-clamp-2" style={{ color: "var(--color-ink-muted)" }}>
                    {alert.ai_summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
