import { afterEach, describe, expect, it } from "vitest";
import {
  FOUNDING_CAP,
  foundingSoldOut,
  isFoundingPriceId,
  isFoundingPriceIds,
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
