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

function isAllowlistedAdmin(clerkUserId: string): boolean {
  const allowlist = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowlist.includes(clerkUserId);
}

/**
 * Entitlements for a specific user id (or null = anonymous → watch).
 * Per-request memoized via React cache(): a render costs one query, not N.
 * Fail-closed: any DB error degrades to watch.
 */
export const getEntitlementsForUser = cache(
  async (clerkUserId: string | null): Promise<Entitlements> => {
    if (!clerkUserId) return deriveEntitlements(null);
    const admin = isAllowlistedAdmin(clerkUserId);
    if (!isDatabaseConfigured()) return deriveEntitlements(null, admin);
    try {
      const row = await queryOne<SubscriptionRow>(
        `SELECT tier, status, is_founding
         FROM user_subscriptions
         WHERE clerk_user_id = $1
           AND ${QUALIFYING_STATUS_SQL}`,
        [clerkUserId],
      );
      return deriveEntitlements(row, admin);
    } catch {
      return deriveEntitlements(null, admin);
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
