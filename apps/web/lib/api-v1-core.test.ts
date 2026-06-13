import { describe, expect, it } from "vitest";
import {
  API_DAILY_LIMITS,
  GROUP_BY_VALUES,
  confidencesAtOrAbove,
  decodeCursor,
  encodeCursor,
  generateApiKey,
  hashApiKey,
  isAfterCursor,
  isWellFormedApiKey,
  parseIsoParam,
  parseLimitParam,
  parseWeaponTypeParam,
  rateLimitState,
  utcMidnightResetEpoch,
  type EventCursor,
} from "./api-v1-core";
import { WEAPON_TYPES } from "./types";

describe("API key generation + hash roundtrip", () => {
  it("format, uniqueness, prefix, hash roundtrip", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(isWellFormedApiKey(a.key)).toBe(true);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    // the stored hash never contains the key material
    expect(a.key.includes(a.hash)).toBe(false);
  });

  it("rejects malformed keys before any DB lookup", () => {
    expect(isWellFormedApiKey("snl_live_short")).toBe(false);
    expect(isWellFormedApiKey("sk_live_" + "a".repeat(32))).toBe(false);
    expect(isWellFormedApiKey("")).toBe(false);
  });
});

describe("metering boundary (1000/1001)", () => {
  it("call 1000 allowed with 0 remaining; call 1001 rejected", () => {
    const limit = API_DAILY_LIMITS.analyst!;
    expect(limit).toBe(1000);
    expect(rateLimitState(999, limit)).toEqual({ allowed: true, remaining: 1 });
    expect(rateLimitState(1000, limit)).toEqual({ allowed: true, remaining: 0 });
    expect(rateLimitState(1001, limit)).toEqual({ allowed: false, remaining: 0 });
  });

  it("bureau pre-wired at 25k; watch has no limit entry (no API)", () => {
    expect(API_DAILY_LIMITS.bureau).toBe(25_000);
    expect(API_DAILY_LIMITS.watch).toBeUndefined();
  });

  it("reset is the next UTC midnight", () => {
    const reset = utcMidnightResetEpoch(new Date("2026-06-12T13:45:00Z"));
    expect(reset).toBe(Math.floor(Date.parse("2026-06-13T00:00:00Z") / 1000));
  });
});

describe("param validation", () => {
  it("bad ISO dates rejected", () => {
    expect(parseIsoParam("since", "not-a-date")).toHaveProperty("code", "invalid_parameter");
    expect(parseIsoParam("since", "2026-06-01T00:00:00Z")).toBeInstanceOf(Date);
    expect(parseIsoParam("since", null)).toBeNull();
  });

  it("oversized / malformed limit rejected; default applied", () => {
    expect(parseLimitParam(null)).toBe(50);
    expect(parseLimitParam("200")).toBe(200);
    expect(parseLimitParam("201")).toHaveProperty("code", "invalid_parameter");
    expect(parseLimitParam("0")).toHaveProperty("code", "invalid_parameter");
    expect(parseLimitParam("abc")).toHaveProperty("code", "invalid_parameter");
  });

  it("unknown min_confidence rejected; ladder respected", () => {
    expect(confidencesAtOrAbove("nope")).toHaveProperty("code", "invalid_parameter");
    expect(confidencesAtOrAbove("partial")).toEqual(["partial", "verified"]);
    expect(confidencesAtOrAbove("verified")).toEqual(["verified"]);
  });
});

describe("weapon_type filter param (threat axis)", () => {
  it("every vocabulary value passes; absent param means no filter", () => {
    for (const w of WEAPON_TYPES) expect(parseWeaponTypeParam(w)).toBe(w);
    expect(parseWeaponTypeParam(null)).toBeNull();
    expect(parseWeaponTypeParam("")).toBeNull();
  });

  it("out-of-vocabulary values rejected with the standard 422 shape", () => {
    const r = parseWeaponTypeParam("nuke");
    expect(r).toHaveProperty("code", "invalid_parameter");
    expect(r).toHaveProperty("message", `weapon_type must be one of ${WEAPON_TYPES.join(", ")}`);
    // case-sensitive, and "null" is not a filterable class — NULL rows mean
    // no identifiable kinetic capability and are reachable only unfiltered.
    expect(parseWeaponTypeParam("DRONE")).toHaveProperty("code", "invalid_parameter");
    expect(parseWeaponTypeParam("null")).toHaveProperty("code", "invalid_parameter");
  });

  it("vocabulary is the 8-class canon mirror; group_by gained weapon_type", () => {
    expect(WEAPON_TYPES).toEqual([
      "artillery", "drone", "missile", "armor", "infantry", "naval", "aircraft", "other",
    ]);
    expect(GROUP_BY_VALUES).toContain("weapon_type");
  });
});

describe("cursor pagination stability across inserts", () => {
  const rows: EventCursor[] = [
    { occurredAt: "2026-06-12T10:00:00.000Z", id: "e" },
    { occurredAt: "2026-06-12T09:00:00.000Z", id: "d" },
    { occurredAt: "2026-06-12T08:00:00.000Z", id: "c" },
    { occurredAt: "2026-06-12T08:00:00.000Z", id: "b" }, // tie on occurred_at
    { occurredAt: "2026-06-12T07:00:00.000Z", id: "a" },
  ];

  it("encode/decode roundtrip", () => {
    const c = { occurredAt: "2026-06-12T08:00:00.000Z", id: "b" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("!!!garbage")).toHaveProperty("code", "invalid_parameter");
  });

  it("page 2 is unaffected by rows inserted above the cursor", () => {
    const page1 = rows.slice(0, 2);
    const cursor = page1[page1.length - 1];
    const page2Before = rows.filter((r) => isAfterCursor(r, cursor));
    // a NEW newer event arrives (top of feed) between page fetches
    const withInsert = [{ occurredAt: "2026-06-12T11:00:00.000Z", id: "f" }, ...rows];
    const page2After = withInsert.filter((r) => isAfterCursor(r, cursor));
    expect(page2After).toEqual(page2Before);
    // ties on occurred_at break deterministically by id
    expect(page2Before.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
