import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface Attack {
  id: string;
  srcLat: number;
  srcLng: number;
  dstLat: number;
  dstLng: number;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  timestamp: string;
}

const HQ_LAT = 37.7749;
const HQ_LNG = -122.4194;

function ipToCoords(ip: string): { lat: number; lng: number } {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return { lat: 0, lng: 0 };

  const [a, b, c] = parts;

  if (a === 10) return { lat: 38.9, lng: -77.0 };
  if (a === 172 && b >= 16 && b <= 31) return { lat: 51.5, lng: -0.12 };
  if (a === 192 && b === 168) return { lat: 37.7, lng: -122.4 };

  const knownRanges: Array<[number, number, number, number]> = [
    [1, 0, 35.68, 139.69],
    [5, 0, 52.37, 4.9],
    [8, 8, 37.77, -122.41],
    [31, 0, 48.85, 2.35],
    [37, 0, 55.75, 37.62],
    [41, 0, -1.28, 36.82],
    [45, 0, 43.65, -79.38],
    [46, 0, 59.33, 18.06],
    [58, 0, 39.91, 116.39],
    [62, 0, 53.34, -6.26],
    [77, 0, 41.38, 2.17],
    [80, 0, 52.52, 13.4],
    [91, 0, 41.01, 28.96],
    [103, 0, 1.35, 103.82],
    [104, 0, 37.77, -122.41],
    [113, 0, 31.23, 121.47],
    [118, 0, 22.31, 114.16],
    [121, 0, 25.04, 121.56],
    [130, 0, -33.87, 151.21],
    [134, 0, 19.43, -99.13],
    [138, 0, -26.2, 28.04],
    [185, 0, 48.21, 16.37],
    [190, 0, -23.55, -46.63],
    [196, 0, -25.75, 28.19],
    [200, 0, -34.6, -58.38],
    [210, 0, 35.69, 139.69],
    [218, 0, 37.57, 126.98],
  ];

  for (const [prefix, , lat, lng] of knownRanges) {
    if (a === prefix) {
      const jitterLat = ((b * c) % 10) / 10 - 0.5;
      const jitterLng = ((b + c) % 10) / 10 - 0.5;
      return { lat: lat + jitterLat, lng: lng + jitterLng };
    }
  }

  const lat = ((a * b + c) % 140) - 70;
  const lng = ((a + b * c) % 340) - 170;
  return { lat, lng };
}

export async function GET() {
  try {
    const rows = await query<{
      id: string;
      severity: string;
      alert_type: string;
      occurred_at: string;
      src_ip: string | null;
    }>(
      `SELECT a.id, a.severity, a.alert_type, a.occurred_at,
              te.src_ip::text as src_ip
       FROM security_alerts a
       LEFT JOIN LATERAL (
         SELECT src_ip FROM telemetry_events
         WHERE id = ANY(a.telemetry_ids) AND src_ip IS NOT NULL
         LIMIT 1
       ) te ON true
       WHERE a.occurred_at >= now() - interval '24 hours'
         AND (te.src_ip IS NOT NULL OR a.asset_id IS NOT NULL)
       ORDER BY a.occurred_at DESC
       LIMIT 200`
    );

    const attacks: Attack[] = rows
      .filter((r) => r.src_ip)
      .map((r) => {
        const { lat: srcLat, lng: srcLng } = ipToCoords(r.src_ip!);
        return {
          id: r.id,
          srcLat,
          srcLng,
          dstLat: HQ_LAT,
          dstLng: HQ_LNG,
          severity: r.severity as Attack["severity"],
          type: r.alert_type,
          timestamp: r.occurred_at,
        };
      });

    return NextResponse.json({ attacks });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
