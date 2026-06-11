import { notFound } from "next/navigation";
import { getFullBriefing } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmbedBriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getFullBriefing(id);
  if (result.kind === "missing") notFound();

  // Embeds serve briefings ≤24h old publicly; older returns the unavailable
  // state (token-gated archive embeds land in W2-3). No data in the payload.
  if (result.kind === "gated") {
    return (
      <div style={{
        margin: "-20px",
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "16px 18px",
        fontFamily: "var(--font-sans-stack)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-tertiary)",
          marginBottom: "8px",
        }}>Sentinel Review · Daily Briefing</div>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "42ch", lineHeight: 1.6 }}>
          This briefing is older than 24 hours. The briefing archive is available to Analyst subscribers.
        </div>
        <a href="https://dashboard.thesentinelreview.com/pricing" style={{
          marginTop: "10px",
          fontFamily: "var(--font-mono-stack)",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--text-secondary)",
        }}>thesentinelreview.com/pricing →</a>
      </div>
    );
  }

  const brief = result.data;

  return (
    <div style={{
      margin: "-20px",
      minHeight: "100vh",
      background: "var(--bg)",
      padding: "16px 18px",
      fontFamily: "var(--font-sans-stack)",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        fontFamily: "var(--font-mono-stack)",
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-tertiary)",
        marginBottom: "10px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
      }}>
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Sentinel Review</span>
        <span>/</span>
        <span>Daily Briefing · {brief.date} · {brief.utc_time}</span>
        {!brief.reviewed && (
          <span style={{
            border: "1px solid var(--border)",
            padding: "2px 6px",
            borderRadius: "2px",
            color: "var(--text-tertiary)",
          }}>AI Draft</span>
        )}
      </div>

      <div style={{ flex: 1 }}>
        {brief.full_paragraphs.map((p, i) => (
          <p key={i} style={{
            fontSize: "13px",
            lineHeight: "1.72",
            color: i === brief.full_paragraphs.length - 1 ? "var(--text-secondary)" : "var(--text)",
            marginBottom: "12px",
          }}>{p}</p>
        ))}
      </div>

      <div style={{
        marginTop: "12px",
        paddingTop: "10px",
        borderTop: "1px solid var(--border)",
        fontFamily: "var(--font-mono-stack)",
        fontSize: "9px",
        color: "var(--text-tertiary)",
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>thesentinelreview.com</span>
        <span>Compiled from {brief.source_count} sources</span>
      </div>
    </div>
  );
}
