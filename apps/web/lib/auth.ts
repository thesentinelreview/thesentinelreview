import { auth } from "@clerk/nextjs/server";
import { queryOne } from "./db";

export type Tier = "watch" | "analyst" | "bureau";

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
