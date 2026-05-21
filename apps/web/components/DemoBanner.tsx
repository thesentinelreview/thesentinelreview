import type { DataStatus } from "@/lib/queries";

const MESSAGES: Record<Exclude<DataStatus, "live">, string> = {
  "no-db":    "Demo data — DATABASE_URL is not configured. Connect a database and start the ingest service to see live events.",
  "db-empty": "No live events found — the database appears empty. Check that the ingest service is running and populating data.",
};

export default function DemoBanner({ status }: { status: DataStatus }) {
  if (status === "live") return null;

  return (
    <div className="demo-banner" style={{
      margin: "-20px -20px 0",
      padding: "7px 20px",
      background: "var(--amber-dim)",
      borderBottom: "1px solid rgba(244,162,97,0.4)",
      color: "var(--amber)",
      fontFamily: "var(--font-mono-stack)",
      fontSize: "11px",
      letterSpacing: "0.04em",
      textAlign: "center",
    }}>
      ⚠ {MESSAGES[status]}
    </div>
  );
}
