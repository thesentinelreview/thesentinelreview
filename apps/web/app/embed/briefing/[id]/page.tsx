import { notFound } from "next/navigation";
import { getFullBriefing } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmbedBriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await getFullBriefing(id);
  if (!brief) notFound();

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
