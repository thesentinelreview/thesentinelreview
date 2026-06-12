import type { Tier } from "./auth";

/**
 * Trim env-pasted whitespace. A secret/ID pasted into the Vercel UI with a
 * trailing newline corrupts auth headers, HMAC signatures, and ID equality
 * checks (same defect class as the R2 backup incident, PR #230). Keys, IDs,
 * and URLs never legitimately contain whitespace.
 */
export function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Validate NEXT_PUBLIC_SITE_URL into an origin for Stripe redirect URLs.
 * Returns null when unset/unparseable so the checkout route can fail with a
 * named error instead of Stripe's generic url_invalid. Using .origin also
 * neutralizes a pasted trailing slash.
 */
export function resolveSiteOrigin(value: string | undefined): string | null {
  const cleaned = cleanEnv(value);
  if (!cleaned) return null;
  try {
    return new URL(cleaned).origin;
  } catch {
    return null;
  }
}

// Single source of truth for which Stripe Price IDs map to which tier.
// Used by /api/checkout (validation), /api/activate (post-checkout DB write),
// and the Stripe webhook (out-of-band updates).
export function getPriceTierMap(): Record<string, Exclude<Tier, "watch">> {
  const map: Record<string, Exclude<Tier, "watch">> = {};
  const add = (id: string, tier: Exclude<Tier, "watch">) => {
    if (id) map[id] = tier;
  };
  add(cleanEnv(process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY), "analyst");
  add(cleanEnv(process.env.NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY),  "analyst");
  add(cleanEnv(process.env.NEXT_PUBLIC_STRIPE_BUREAU_PRICE_MONTHLY),  "bureau");
  add(cleanEnv(process.env.NEXT_PUBLIC_STRIPE_BUREAU_PRICE_YEARLY),   "bureau");
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
  return cleanEnv(process.env.STRIPE_FOUNDING_PRICE_ID) || null;
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
