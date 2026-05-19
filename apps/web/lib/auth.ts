import { auth } from "@clerk/nextjs/server";
import { queryOne } from "./db";

export type Tier = "watch" | "analyst" | "bureau";

export interface SubscriptionDetails {
  tier:               Tier;
  status:             string;
  current_period_end: Date | null;
  is_founding:        boolean;
}

export async function getUserTier(): Promise<Tier> {
  const { userId } = await auth();
  if (!userId) return "watch";

  try {
    const row = await queryOne<{ tier: Tier; status: string }>(
      `SELECT tier, status FROM user_subscriptions WHERE clerk_user_id = $1`,
      [userId],
    );
    if (!row || row.status !== "active") return "watch";
    return row.tier;
  } catch {
    return "watch";
  }
}

export async function getSubscriptionDetails(): Promise<SubscriptionDetails | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    const row = await queryOne<{
      tier:               Tier;
      status:             string;
      current_period_end: string | null;
      is_founding:        boolean;
    }>(
      `SELECT tier, status, current_period_end, is_founding
       FROM user_subscriptions
       WHERE clerk_user_id = $1`,
      [userId],
    );
    if (!row) return null;
    return {
      tier:               row.tier,
      status:             row.status,
      current_period_end: row.current_period_end ? new Date(row.current_period_end) : null,
      is_founding:        row.is_founding,
    };
  } catch {
    return null;
  }
}
