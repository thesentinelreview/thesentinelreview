// Route-level tests for GET /api/v1/analytics/counts: real handler, real
// group_by whitelist, DB mocked. Covers the weapon_type grouping and its
// key:null bucket (unclassified events), which is what makes the counts
// reconcile with /events totals over the same window.
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

const WINDOW = "since=2026-06-01T00:00:00Z&until=2026-06-12T00:00:00Z";

function req(qs: string): Request {
  return new Request(`https://dashboard.thesentinelreview.com/api/v1/analytics/counts?${qs}`);
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/v1/analytics/counts — group_by=weapon_type", () => {
  it("returns class rows plus one key:null bucket; totals reconcile", async () => {
    // GROUP BY e.weapon_type surfaces unclassified events as a NULL key row.
    queryMock.mockResolvedValue([
      { key: "drone", total: 719 },
      { key: null, total: 533 },
      { key: "missile", total: 240 },
    ]);
    const res = await GET(req(`${WINDOW}&group_by=weapon_type`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_by).toBe("weapon_type");
    expect(body.counts).toContainEqual({ key: null, total: 533 });
    // null bucket included → the sum equals the unfiltered /events count
    const sum = body.counts.reduce((n: number, r: { total: number }) => n + r.total, 0);
    expect(sum).toBe(719 + 533 + 240);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("e.weapon_type AS key");
  });

  it("unknown group_by → 422 listing weapon_type among the allowed values", async () => {
    const res = await GET(req(`${WINDOW}&group_by=caliber`));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_parameter");
    expect(body.error).toBe(
      "group_by must be one of event_type, theater, confidence_band, weapon_type",
    );
    expect(queryMock).not.toHaveBeenCalled();
  });
});
