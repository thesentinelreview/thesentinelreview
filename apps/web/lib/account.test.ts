import { describe, expect, it } from "vitest";
import { deriveAccountState, welcomeMessage, type AccountRow } from "./account";

const base: AccountRow = {
  tier: "analyst",
  status: "active",
  is_founding: true,
  current_period_end: new Date("2026-07-11T20:00:00Z"),
  updated_at: new Date("2026-06-11T20:00:00Z"),
  stripe_customer_id: "cus_x",
  stripe_subscription_id: "sub_x",
};

describe("account state per persona", () => {
  it("no row — watch (free tier)", () => {
    expect(deriveAccountState(null)).toEqual({ kind: "watch" });
  });

  it("active analyst — renewal date + founding passthrough", () => {
    const s = deriveAccountState(base);
    expect(s).toEqual({
      kind: "active",
      tier: "analyst",
      isFounding: true,
      renewsAt: base.current_period_end,
    });
  });

  it("trialing folds into active", () => {
    expect(deriveAccountState({ ...base, status: "trialing" }).kind).toBe("active");
  });

  it("past_due — own state, keeps renewal date for the retry window", () => {
    const s = deriveAccountState({ ...base, status: "past_due" });
    expect(s.kind).toBe("past_due");
  });

  it("cancelled — ended date from period end; founding flag NOT surfaced", () => {
    const s = deriveAccountState({ ...base, status: "cancelled" });
    expect(s).toEqual({ kind: "cancelled", endedAt: base.current_period_end });
    expect("isFounding" in s).toBe(false);
  });

  it("cancelled with no period end — falls back to updated_at", () => {
    const s = deriveAccountState({ ...base, status: "cancelled", current_period_end: null });
    expect(s).toEqual({ kind: "cancelled", endedAt: base.updated_at });
  });
});

describe("welcome banner", () => {
  it("founding purchase — live seat number", () => {
    expect(welcomeMessage(true, 1)).toBe("You're in — Founding Analyst #1.");
    expect(welcomeMessage(true, 42)).toBe("You're in — Founding Analyst #42.");
  });

  it("post-window purchase — plain variant, no fabricated seat number", () => {
    expect(welcomeMessage(false, 250)).toBe("You're in — Analyst access is active.");
  });
});
