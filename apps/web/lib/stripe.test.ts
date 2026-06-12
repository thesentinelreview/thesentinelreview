import { afterEach, describe, expect, it } from "vitest";
import {
  FOUNDING_CAP,
  cleanEnv,
  foundingSeatsRemaining,
  foundingSoldOut,
  isFoundingPriceId,
  isFoundingPriceIds,
  resolveSiteOrigin,
  tierForPriceId,
} from "./stripe";

describe("founding cap guard decision", () => {
  it("249 claimed seats — window open", () => {
    expect(foundingSoldOut(249)).toBe(false);
  });

  it("250 claimed seats — sold out", () => {
    expect(foundingSoldOut(250)).toBe(true);
  });

  it("251 claimed seats — sold out (over-cap stays closed)", () => {
    expect(foundingSoldOut(251)).toBe(true);
  });

  it("cap is 250 seats", () => {
    expect(FOUNDING_CAP).toBe(250);
  });

  it("empty table — window open", () => {
    expect(foundingSoldOut(0)).toBe(false);
  });
});

describe("founding seats remaining (pricing-page counter + window-closed branch)", () => {
  it("empty table — 250 / 250 remaining (the honest zero state)", () => {
    expect(foundingSeatsRemaining(0)).toBe(250);
  });

  it("249 claimed — 1 remaining, window open", () => {
    expect(foundingSeatsRemaining(249)).toBe(1);
    expect(foundingSeatsRemaining(249) <= 0).toBe(false);
  });

  it("250 claimed — 0 remaining, window-closed branch renders", () => {
    expect(foundingSeatsRemaining(250)).toBe(0);
    expect(foundingSeatsRemaining(250) <= 0).toBe(true);
  });

  it("251 claimed (over-cap) — clamps to 0, window stays closed", () => {
    expect(foundingSeatsRemaining(251)).toBe(0);
    expect(foundingSeatsRemaining(251) <= 0).toBe(true);
  });
});

describe("is_founding derivation from STRIPE_FOUNDING_PRICE_ID", () => {
  const FOUNDING = "price_test_founding";

  afterEach(() => {
    delete process.env.STRIPE_FOUNDING_PRICE_ID;
  });

  it("matches exactly the founding price id", () => {
    process.env.STRIPE_FOUNDING_PRICE_ID = FOUNDING;
    expect(isFoundingPriceId(FOUNDING)).toBe(true);
    expect(isFoundingPriceId("price_test_standard")).toBe(false);
  });

  it("derives from a subscription's price id list", () => {
    process.env.STRIPE_FOUNDING_PRICE_ID = FOUNDING;
    expect(isFoundingPriceIds([FOUNDING])).toBe(true);
    expect(isFoundingPriceIds(["price_test_standard", FOUNDING])).toBe(true);
    expect(isFoundingPriceIds(["price_test_standard"])).toBe(false);
    expect(isFoundingPriceIds([])).toBe(false);
  });

  it("never founding when STRIPE_FOUNDING_PRICE_ID is unset", () => {
    expect(isFoundingPriceId(FOUNDING)).toBe(false);
    expect(isFoundingPriceIds([FOUNDING])).toBe(false);
  });

  it("never founding when STRIPE_FOUNDING_PRICE_ID is empty", () => {
    process.env.STRIPE_FOUNDING_PRICE_ID = "";
    expect(isFoundingPriceId("")).toBe(false);
    expect(isFoundingPriceIds([""])).toBe(false);
  });
});

describe("env whitespace hardening (the R2-incident defect class)", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY;
    delete process.env.STRIPE_FOUNDING_PRICE_ID;
  });

  it("cleanEnv strips pasted whitespace; unset → empty string", () => {
    expect(cleanEnv("sk_test_abc\n")).toBe("sk_test_abc");
    expect(cleanEnv("  price_x \t\n")).toBe("price_x");
    expect(cleanEnv(undefined)).toBe("");
  });

  it("a price ID pasted with a trailing newline still maps to its tier", () => {
    process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY = "price_dirty\n";
    expect(tierForPriceId("price_dirty")).toBe("analyst");
  });

  it("a founding ID pasted with a trailing newline still derives is_founding", () => {
    process.env.STRIPE_FOUNDING_PRICE_ID = "price_founding\n";
    expect(isFoundingPriceId("price_founding")).toBe(true);
    expect(isFoundingPriceIds(["price_founding"])).toBe(true);
  });
});

describe("resolveSiteOrigin (named failure instead of Stripe url_invalid)", () => {
  it("valid URL → origin; trailing slash neutralized", () => {
    expect(resolveSiteOrigin("https://dashboard.thesentinelreview.com")).toBe(
      "https://dashboard.thesentinelreview.com",
    );
    expect(resolveSiteOrigin("https://dashboard.thesentinelreview.com/")).toBe(
      "https://dashboard.thesentinelreview.com",
    );
    expect(resolveSiteOrigin("https://dashboard.thesentinelreview.com\n")).toBe(
      "https://dashboard.thesentinelreview.com",
    );
  });

  it("unset or unparseable → null (route returns the named 500)", () => {
    expect(resolveSiteOrigin(undefined)).toBeNull();
    expect(resolveSiteOrigin("")).toBeNull();
    expect(resolveSiteOrigin("dashboard.thesentinelreview.com")).toBeNull();
    expect(resolveSiteOrigin("not a url")).toBeNull();
  });
});
