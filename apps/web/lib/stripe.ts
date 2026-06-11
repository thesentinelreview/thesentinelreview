import type { Tier } from "./auth";

// Single source of truth for which Stripe Price IDs map to which tier.
// Used by /api/checkout (validation), /api/activate (post-checkout DB write),
// and the Stripe webhook (out-of-band updates).
export function getPriceTierMap(): Record<string, Exclude<Tier, "watch">> {
  const map: Record<string, Exclude<Tier, "watch">> = {};
  const add = (id: string | undefined, tier: Exclude<Tier, "watch">) => {
    if (id) map[id] = tier;
  };
  add(process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY, "analyst");
  add(process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY,  "analyst");
  add(process.env.NEXT_PUBLIC_STRIPE_BUREAU_PRICE_MONTHLY,  "bureau");
  add(process.env.NEXT_PUBLIC_STRIPE_BUREAU_PRICE_YEARLY,   "bureau");
  return map;
}

export function tierForPriceId(priceId: string): Exclude<Tier, "watch"> | null {
  return getPriceTierMap()[priceId] ?? null;
}

export function tierForPriceIds(priceIds: readonly string[]): Exclude<Tier, "watch"> | null {
  const map = getPriceTierMap();
  // bureau wins if any item is bureau, then analyst.
  let resolved: Exclude<Tier, "watch"> | null = null;
  for (const id of priceIds) {
    const t = map[id];
    if (!t) continue;
    if (t === "bureau") return "bureau";
    resolved = t;
  }
  return resolved;
}

// Founding window (W1-1). The founding price occupies the analyst monthly slot
// while seats remain; at the cap, the slot swaps to the standard price.
// STRIPE_FOUNDING_PRICE_ID stays constant across that swap, so is_founding
// derivation and the cap guard never depend on which price the slot holds.
export const FOUNDING_CAP = 250;

export function foundingPriceId(): string | null {
  return process.env.STRIPE_FOUNDING_PRICE_ID || null;
}

export function isFoundingPriceId(priceId: string): boolean {
  const founding = foundingPriceId();
  return !!founding && priceId === founding;
}

export function isFoundingPriceIds(priceIds: readonly string[]): boolean {
  return priceIds.some((id) => isFoundingPriceId(id));
}

export function foundingSeatsRemaining(claimedSeats: number): number {
  return Math.max(0, FOUNDING_CAP - claimedSeats);
}

export function foundingSoldOut(claimedSeats: number): boolean {
  return claimedSeats >= FOUNDING_CAP;
}
