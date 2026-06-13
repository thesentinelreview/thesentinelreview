// Route-level tests for GET /api/v1/events: the real handler runs with only
// authenticateApiRequest and the DB mocked, so param validation, SQL text,
// and the response JSON (including the new weapon_type field/filter) are the
// production code paths.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlementsForUser: vi.fn() }));
vi.mock("@/lib/api-v1", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api-v1")>();
  return {
    ...mod,
    authenticateApiRequest: vi.fn(async () => ({
      ok: true,
      keyId: "key-1",
      clerkUserId: "user_1",
      entitlements: {},
      rate: { limit: 1000, remaining: 999, reset: 1_781_654_400 },
    })),
  };
});

import { GET } from "./route";
import { query } from "@/lib/db";

const queryMock = vi.mocked(query);

const DB_ROWS = [
  {
    id: "11111111-2222-3333-4444-555555555555",
    occurred_at: new Date("2026-06-12T10:00:00.000Z"),
    event_type: "strike",
    theater: "ukraine",
    lat: 48.527,
    lon: 37.705,
    confidence: "partial",
    title: "Drone strike — Kostiantynivka",
    summary: "Drone strike reported on industrial area",
    source_count: 3,
    platforms: ["telegram", "x"],
    weapon_type: "drone",
  },
  {
    id: "66666666-7777-8888-9999-000000000000",
    occurred_at: new Date("2026-06-12T09:00:00.000Z"),
    event_type: "movement",
    theater: "ukraine",
    lat: 49.0,
    lon: 36.0,
    confidence: "unconfirmed",
    title: "Column movement — Izium axis",
    summary: "Column movement reported, no kinetic capability identified",
    source_count: 1,
    platforms: ["telegram"],
    weapon_type: null,
  },
];

function req(qs: string): Request {
  return new Request(`https://dashboard.thesentinelreview.com/api/v1/events${qs}`);
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue(DB_ROWS);
});

describe("GET /api/v1/events — weapon_type", () => {
  it("every event carries weapon_type (string when classified, null otherwise)", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].weapon_type).toBe("drone");
    expect(body.events[1].weapon_type).toBeNull();
    expect(Object.keys(body.events[1])).toContain("weapon_type");
    // real jsonOk → real rate headers
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1000");
  });

  it("valid weapon_type filter is bound as the $7 SQL parameter", async () => {
    queryMock.mockResolvedValue([DB_ROWS[0]]);
    const res = await GET(req("?weapon_type=drone&limit=5"));
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("($7::text IS NULL OR e.weapon_type = $7)");
    expect((params as unknown[])[6]).toBe("drone");
    expect((await res.json()).events).toHaveLength(1);
  });

  it("absent weapon_type param means no filter (NULL rows included)", async () => {
    await GET(req("?limit=5"));
    const [, params] = queryMock.mock.calls[0];
    expect((params as unknown[])[6]).toBeNull();
  });

  it("out-of-vocabulary weapon_type → 422 invalid_parameter, no query", async () => {
    const res = await GET(req("?weapon_type=nuke"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_parameter");
    expect(body.error).toBe(
      "weapon_type must be one of artillery, drone, missile, armor, infantry, naval, aircraft, other",
    );
    expect(queryMock).not.toHaveBeenCalled();
  });
});
