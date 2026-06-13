// Route-level tests for GET /api/export/events: real handler with Clerk auth,
// entitlements, and the DB mocked. Locks the 12-column CSV contract (license
// line + header + weapon_type as the appended last column), JSON null
// handling, the audit-first export_log row, and the X-Export-* meter headers.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "user_1" })) }));
vi.mock("@/lib/db", () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({
  getEntitlementsForUser: vi.fn(async () => ({ tier: "analyst", canExport: true })),
}));

import { GET } from "./route";
import { query, queryOne } from "@/lib/db";
import { CSV_LICENSE_LINE, EXPORT_COLUMNS } from "@/lib/exports-core";

const queryMock = vi.mocked(query);
const queryOneMock = vi.mocked(queryOne);

const DB_ROWS = [
  {
    event_id: "11111111-2222-3333-4444-555555555555",
    occurred_at: new Date("2026-06-12T10:00:00.000Z"),
    event_type: "strike",
    theater: "ukraine",
    location_name: "Kostiantynivka",
    lat: 48.527,
    lon: 37.705,
    source_count: 3,
    confidence: "partial",
    platforms: ["telegram"],
    summary: "Drone strike reported on industrial area",
    weapon_type: "drone",
  },
  {
    event_id: "66666666-7777-8888-9999-000000000000",
    occurred_at: new Date("2026-06-12T09:00:00.000Z"),
    event_type: "movement",
    theater: "ukraine",
    location_name: "Izium",
    lat: 49.0,
    lon: 36.0,
    source_count: 1,
    confidence: "unconfirmed",
    platforms: ["telegram"],
    summary: "Column movement reported",
    weapon_type: null,
  },
];

let exportLogInserts: unknown[][];

function req(qs: string): Request {
  return new Request(`https://dashboard.thesentinelreview.com/api/export/events?${qs}`);
}

beforeEach(() => {
  exportLogInserts = [];
  queryOneMock.mockReset();
  queryOneMock.mockResolvedValue({ n: 0 }); // first export of the UTC day
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("INSERT INTO export_log")) {
      exportLogInserts.push([...(params ?? [])]);
      return [];
    }
    return DB_ROWS;
  });
});

describe("GET /api/export/events — weapon_type column", () => {
  it("CSV: license line, 12-column header, weapon_type last (empty when NULL)", async () => {
    const res = await GET(req("theater=ukraine&format=csv"));
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe(CSV_LICENSE_LINE);
    expect(lines[1]).toBe(EXPORT_COLUMNS.join(","));
    expect(lines[1].split(",")).toHaveLength(12);
    expect(lines[1].endsWith(",weapon_type")).toBe(true);
    expect(lines[2].endsWith(",drone")).toBe(true);
    expect(lines[3].endsWith("Column movement reported,")).toBe(true); // NULL → empty, not "null"
    // meter headers unchanged by the new column
    expect(res.headers.get("X-Export-Limit")).toBe("20");
    expect(res.headers.get("X-Export-Remaining")).toBe("19");
    expect(res.headers.get("Content-Disposition")).toContain("sentinel-events-ukraine-24h-");
  });

  it("JSON: rows carry weapon_type, JSON null when unclassified", async () => {
    const res = await GET(req("theater=ukraine&format=json"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].weapon_type).toBe("drone");
    expect(body.events[1].weapon_type).toBeNull();
    expect(body._meta.row_count).toBe(2);
  });

  it("audit-first: exactly one export_log row per file, row_count 1:1", async () => {
    await GET(req("theater=ukraine&format=csv"));
    expect(exportLogInserts).toHaveLength(1);
    const [userId, tier, theater, , , format, rowCount, truncated] = exportLogInserts[0];
    expect(userId).toBe("user_1");
    expect(tier).toBe("analyst");
    expect(theater).toBe("ukraine");
    expect(format).toBe("csv");
    expect(rowCount).toBe(2);
    expect(truncated).toBe(false);
  });
});
