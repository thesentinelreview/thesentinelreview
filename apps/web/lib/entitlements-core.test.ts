import { describe, expect, it } from "vitest";
import {
  clampTimeRangeForFloor,
  deriveEntitlements,
  isGatedByFloor,
  tierLabel,
  tierTimeFloor,
  QUALIFYING_STATUS_SQL,
  WATCH_BRIEFING_FLOOR_HOURS,
  WATCH_EVENT_FLOOR_HOURS,
} from "./entitlements-core";

const HOUR = 3_600_000;

describe("tierTimeFloor per persona", () => {
  it("watch events — 7-day floor", () => {
    const floor = tierTimeFloor("watch", "event");
    expect(floor).not.toBeNull();
    expect(Date.now() - floor!.getTime()).toBeCloseTo(WATCH_EVENT_FLOOR_HOURS * HOUR, -4);
    expect(WATCH_EVENT_FLOOR_HOURS).toBe(168);
  });

  it("watch briefings — 24-hour floor", () => {
    const floor = tierTimeFloor("watch", "briefing");
    expect(floor).not.toBeNull();
    expect(Date.now() - floor!.getTime()).toBeCloseTo(WATCH_BRIEFING_FLOOR_HOURS * HOUR, -4);
    expect(WATCH_BRIEFING_FLOOR_HOURS).toBe(24);
  });

  it("analyst, bureau, command — unbounded", () => {
    for (const tier of ["analyst", "bureau", "command"] as const) {
      expect(tierTimeFloor(tier, "event")).toBeNull();
      expect(tierTimeFloor(tier, "briefing")).toBeNull();
    }
  });

  it("kind defaults to event", () => {
    const floor = tierTimeFloor("watch");
    expect(Date.now() - floor!.getTime()).toBeCloseTo(WATCH_EVENT_FLOOR_HOURS * HOUR, -4);
  });
});

describe("entitlements fallbacks", () => {
  it("no row (anonymous or no subscription) — watch, all flags false", () => {
    const e = deriveEntitlements(null);
    expect(e.tier).toBe("watch");
    expect(e.isFounding).toBe(false);
    expect(e.status).toBeNull();
    expect(e.canExport).toBe(false);
    expect(e.canUseApi).toBe(false);
    expect(e.canCreateAlerts).toBe(false);
  });

  it("cancelled row — excluded by the qualifying-status SQL, arrives as null → watch", () => {
    // A cancelled subscription never reaches deriveEntitlements as a row: the
    // SQL filter (QUALIFYING_STATUS_SQL) excludes it. The fallback is watch.
    expect(QUALIFYING_STATUS_SQL).toBe(`status IN ('active', 'past_due', 'trialing')`);
    expect(deriveEntitlements(null).tier).toBe("watch");
  });

  it("active analyst row — analyst, feature flags true", () => {
    const e = deriveEntitlements({ tier: "analyst", status: "active", is_founding: false });
    expect(e.tier).toBe("analyst");
    expect(e.canExport).toBe(true);
    expect(e.canUseApi).toBe(true);
    expect(e.canCreateAlerts).toBe(true);
  });

  it("founding flag passthrough", () => {
    expect(deriveEntitlements({ tier: "analyst", status: "active", is_founding: true }).isFounding).toBe(true);
    expect(deriveEntitlements({ tier: "analyst", status: "past_due", is_founding: false }).isFounding).toBe(false);
  });

  it("unknown tier value in row — fail-closed to watch", () => {
    expect(deriveEntitlements({ tier: "vip", status: "active", is_founding: false }).tier).toBe("watch");
  });

  it("admin grant — command regardless of row", () => {
    expect(deriveEntitlements(null, true).tier).toBe("command");
    expect(deriveEntitlements({ tier: "analyst", status: "active", is_founding: true }, true).tier).toBe("command");
  });
});

describe("clamp — a floored (watch) query never reaches past the floor", () => {
  const floor = new Date(Date.now() - WATCH_EVENT_FLOOR_HOURS * HOUR);

  it("watch: 30d window degrades to 7d; 24h/7d unchanged", () => {
    expect(clampTimeRangeForFloor("30d", floor)).toBe("7d");
    expect(clampTimeRangeForFloor("all", floor)).toBe("7d");
    expect(clampTimeRangeForFloor("7d", floor)).toBe("7d");
    expect(clampTimeRangeForFloor("24h", floor)).toBe("24h");
  });

  it("analyst (null floor): window unbounded/unchanged", () => {
    expect(clampTimeRangeForFloor("30d", null)).toBe("30d");
    expect(clampTimeRangeForFloor("all", null)).toBe("all");
  });

  it("gating predicate: older than floor → gated; newer → visible; null floor → never gated", () => {
    const older = new Date(floor.getTime() - 1);
    const newer = new Date(floor.getTime() + 1);
    expect(isGatedByFloor(older, floor)).toBe(true);
    expect(isGatedByFloor(newer, floor)).toBe(false);
    expect(isGatedByFloor(older.toISOString(), floor)).toBe(true);
    expect(isGatedByFloor(older, null)).toBe(false);
  });
});

describe("tier badge mapping (W1-6)", () => {
  it("all four tiers + signed-out", () => {
    expect(tierLabel("watch")).toBe("Watch Tier");
    expect(tierLabel("analyst")).toBe("Analyst Tier");
    expect(tierLabel("bureau")).toBe("Bureau Tier");
    expect(tierLabel("command")).toBe("Command Tier");
    expect(tierLabel(null)).toBe("Watch Tier");
    expect(tierLabel(undefined)).toBe("Watch Tier");
  });
});
