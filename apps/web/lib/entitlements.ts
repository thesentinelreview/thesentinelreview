import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { isDatabaseConfigured, queryOne } from "./db";
import {
  deriveEntitlements,
  QUALIFYING_STATUS_SQL,
  type Entitlements,
  type SubscriptionRow,
} from "./entitlements-core";

export * from "./entitlements-core";

// Active (unrevoked) staff-issued tier grant, or null. Fail-soft: a missing
// table (deploy ahead of migration) or any DB error degrades to "no grant" so
// the subscription path still resolves.
async function activeGrantTier(clerkUserId: string): Promise<string | null> {
  try {
    const row = await queryOne<{ tier: string }>(
      `SELECT tier FROM tier_grants
       WHERE clerk_user_id = $1 AND revoked_at IS NULL`,
      [clerkUserId],
    );
    return row?.tier ?? null;
  } catch {
    return null;
  }
}

/**
 * Entitlements for a specific user id (or null = anonymous → watch).
 * Precedence: active grant > qualifying subscription > watch.
 * Per-request memoized via React cache(): a render costs one query pass, not N.
 * Fail-closed: any DB error degrades to watch.
 */
export const getEntitlementsForUser = cache(
  async (clerkUserId: string | null): Promise<Entitlements> => {
    if (!clerkUserId) return deriveEntitlements(null);
    if (!isDatabaseConfigured()) return deriveEntitlements(null);
    try {
      const [row, grantTier] = await Promise.all([
        queryOne<SubscriptionRow>(
          `SELECT tier, status, is_founding
           FROM user_subscriptions
           WHERE clerk_user_id = $1
             AND ${QUALIFYING_STATUS_SQL}`,
          [clerkUserId],
        ),
        activeGrantTier(clerkUserId),
      ]);
      return deriveEntitlements(row, grantTier);
    } catch {
      return deriveEntitlements(null);
    }
  },
);

/**
 * Entitlements for the current request's viewer (Clerk session or anonymous).
 * This is the chokepoint the query layer calls — memoized per request.
 */
export const getRequestEntitlements = cache(async (): Promise<Entitlements> => {
  const { userId } = await auth();
  return getEntitlementsForUser(userId ?? null);
});
