import MapWrapper from "@/components/MapWrapper";
import { getMapEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EmbedMapPage() {
  const mapEvents = await getMapEvents();
  return (
    <div style={{
      margin: "-20px",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      fontFamily: "var(--font-mono-stack)",
    }}>
      <div style={{
        position: "absolute",
        bottom: "40px",
        left: "12px",
        zIndex: 10,
        pointerEvents: "none",
        background: "rgba(20,21,25,0.88)",
        border: "1px solid var(--border)",
        padding: "6px 10px",
        borderRadius: "3px",
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-secondary)",
      }}>
        Sentinel Review · thesentinelreview.com
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <MapWrapper events={mapEvents} />
      </div>
    </div>
  );
}
