// Pure account-state derivation for /account — no I/O, fully unit-testable.

export interface AccountRow {
  tier:                   string;
  status:                 string;
  is_founding:            boolean;
  current_period_end:     Date | null;
  updated_at:             Date | null;
  stripe_customer_id:     string | null;
  stripe_subscription_id: string | null;
}

export type AccountState =
  | { kind: "watch" }
  | { kind: "active";    tier: string; isFounding: boolean; renewsAt: Date | null }
  | { kind: "past_due";  tier: string; isFounding: boolean; renewsAt: Date | null }
  | { kind: "cancelled"; endedAt: Date | null };

/**
 * Map a user_subscriptions row (or none) onto the four honest account states.
 * - trialing folds into "active" for display (date line reads as the renewal).
 * - any non-qualifying status renders as cancelled — including the founding
 *   flag being ignored there (cancellation forfeits the founding rate, so a
 *   cancelled row must never display a "locked rate" line).
 */
export function deriveAccountState(row: AccountRow | null): AccountState {
  if (!row) return { kind: "watch" };
  switch (row.status) {
    case "active":
    case "trialing":
      return { kind: "active", tier: row.tier, isFounding: row.is_founding, renewsAt: row.current_period_end };
    case "past_due":
      return { kind: "past_due", tier: row.tier, isFounding: row.is_founding, renewsAt: row.current_period_end };
    default:
      return { kind: "cancelled", endedAt: row.current_period_end ?? row.updated_at };
  }
}

/**
 * Post-checkout welcome copy. The founding variant carries the live seat
 * number (the claimed count at render — the buyer's own row included);
 * post-window purchases get the plain variant. No fabricated numbers.
 */
export function welcomeMessage(isFounding: boolean, foundingClaimed: number): string {
  return isFounding
    ? `You're in — Founding Analyst #${foundingClaimed}.`
    : "You're in — Analyst access is active.";
}
