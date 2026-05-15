import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface GraphNode {
  id: string;
  label: string;
  type: "server" | "workstation" | "network" | "cloud" | "unknown";
  status: "healthy" | "warning" | "critical" | "offline";
  ip: string;
  alertCount: number;
}

interface GraphLink {
  source: string;
  target: string;
  strength: number;
}

function deriveNodeType(asset: Record<string, unknown>): GraphNode["type"] {
  const tags = (asset.tags as string[]) ?? [];
  const hostname = ((asset.hostname as string) ?? "").toLowerCase();
  if (tags.includes("network") || hostname.includes("switch") || hostname.includes("router") || hostname.includes("fw")) return "network";
  if (tags.includes("cloud") || hostname.includes("cloud") || hostname.includes("aws") || hostname.includes("gcp") || hostname.includes("azure")) return "cloud";
  if ((asset.os_platform as string) === "windows" && !hostname.includes("srv") && !hostname.includes("server")) return "workstation";
  if (hostname.includes("srv") || hostname.includes("server") || (asset.os_platform as string) === "linux") return "server";
  return "unknown";
}

function deriveStatus(riskScore: number, isActive: boolean): GraphNode["status"] {
  if (!isActive) return "offline";
  if (riskScore >= 80) return "critical";
  if (riskScore >= 50) return "warning";
  return "healthy";
}

function ipToSubnet24(ip: string): string {
  const parts = ip.split(".");
  return parts.slice(0, 3).join(".");
}

export async function GET() {
  try {
    const [assets, alertCounts, telemetryPairs] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT id, hostname, ip_address::text as ip_address, os_platform,
                risk_score, is_active, tags, criticality
         FROM assets
         WHERE is_active = true
         ORDER BY risk_score DESC
         LIMIT 200`
      ),
      query<{ asset_id: string; cnt: string }>(
        `SELECT asset_id, COUNT(*) as cnt
         FROM security_alerts
         WHERE status IN ('open','investigating')
           AND asset_id IS NOT NULL
         GROUP BY asset_id`
      ),
      query<{ asset_id: string; dst_asset_id: string; pairs: string }>(
        `SELECT DISTINCT te1.asset_id, te2.asset_id as dst_asset_id, '1' as pairs
         FROM telemetry_events te1
         JOIN telemetry_events te2
           ON te1.dst_ip = te2.src_ip
          AND te1.asset_id != te2.asset_id
          AND te1.event_time >= now() - interval '24 hours'
         WHERE te1.asset_id IS NOT NULL AND te2.asset_id IS NOT NULL
         LIMIT 500`
      ),
    ]);

    const alertCountMap = new Map<string, number>();
    for (const row of alertCounts) {
      alertCountMap.set(row.asset_id, parseInt(row.cnt));
    }

    const nodes: GraphNode[] = assets.map((asset) => ({
      id: asset.id as string,
      label: (asset.hostname as string) ?? (asset.ip_address as string) ?? (asset.id as string).slice(0, 8),
      type: deriveNodeType(asset),
      status: deriveStatus(asset.risk_score as number, asset.is_active as boolean),
      ip: (asset.ip_address as string) ?? "",
      alertCount: alertCountMap.get(asset.id as string) ?? 0,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const linkMap = new Map<string, GraphLink>();

    const subnet24Map = new Map<string, string[]>();
    for (const node of nodes) {
      if (!node.ip) continue;
      const subnet = ipToSubnet24(node.ip);
      if (!subnet24Map.has(subnet)) subnet24Map.set(subnet, []);
      subnet24Map.get(subnet)!.push(node.id);
    }

    for (const [, members] of subnet24Map) {
      if (members.length < 2) continue;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length && j < i + 5; j++) {
          const key = [members[i], members[j]].sort().join("|");
          if (!linkMap.has(key)) {
            linkMap.set(key, { source: members[i], target: members[j], strength: 1 });
          }
        }
      }
    }

    for (const row of telemetryPairs) {
      if (!nodeIds.has(row.asset_id) || !nodeIds.has(row.dst_asset_id)) continue;
      const key = [row.asset_id, row.dst_asset_id].sort().join("|");
      const existing = linkMap.get(key);
      if (existing) {
        existing.strength = Math.min(existing.strength + 1, 5);
      } else {
        linkMap.set(key, { source: row.asset_id, target: row.dst_asset_id, strength: 2 });
      }
    }

    return NextResponse.json({ nodes, links: Array.from(linkMap.values()) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
