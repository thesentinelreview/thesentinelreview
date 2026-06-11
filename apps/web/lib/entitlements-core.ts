// Pure entitlements logic — no imports, no I/O, fully unit-testable.
// Server wiring (Clerk auth + DB read + per-request memoization) lives in
// ./entitlements.ts, which re-exports everything here.

export type Tier = "watch" | "analyst" | "bureau" | "command";

export interface Entitlements {
  tier:            Tier;
  isFounding:      boolean;
  /** Qualifying subscription status, or null when entitlements fall back to watch. */
  status:          string | null;
  // Week-2 feature flags — the shape is the contract; consumers land in W2.
  canExport:       boolean;
  canUseApi:       boolean;
  canCreateAlerts: boolean;
}

export interface SubscriptionRow {
  tier:        string;
  status:      string;
  is_founding: boolean;
}

const PAID_TIERS: ReadonlySet<string> = new Set(["analyst", "bureau", "command"]);

export const WATCH_EVENT_FLOOR_HOURS = 7 * 24;
export const WATCH_BRIEFING_FLOOR_HOURS = 24;

/**
 * Derive an Entitlements object from a qualifying user_subscriptions row (or
 * null) and the admin-allowlist check. The row, when present, has already
 * passed the qualifying-status SQL filter; a non-qualifying or absent row
 * arrives here as null and falls back to watch.
 *
 * Admins get "command" — bureau/command are reachable only via grants for now
 * (command has no purchase path and is not in the DB tier CHECK).
 */
export function deriveEntitlements(
  row: SubscriptionRow | null,
  isAdminUser = false,
): Entitlements {
  // TEMPORARY until W1-4: staff access and customer tier are different
  // concepts. The real grant mechanism (W1-4 admin) replaces this
  // allowlist→command mapping, and ADMIN_CLERK_USER_IDS goes back to
  // meaning admin only.
  if (isAdminUser) {
    return {
      tier: "command",
      isFounding: row?.is_founding ?? false,
      status: row?.status ?? null,
      canExport: true,
      canUseApi: true,
      canCreateAlerts: true,
    };
  }
  if (!row || !PAID_TIERS.has(row.tier)) {
    return {
      tier: "watch",
      isFounding: false,
      status: null,
      canExport: false,
      canUseApi: false,
      canCreateAlerts: false,
    };
  }
  return {
    tier: row.tier as Tier,
    isFounding: row.is_founding,
    status: row.status,
    canExport: true,
    canUseApi: true,
    canCreateAlerts: true,
  };
}

/**
 * The tier time floor: the oldest timestamp a tier may read.
 * watch → now − 7 days for events/posts, now − 24 hours for briefings.
 * analyst and above → null (unbounded).
 */
export function tierTimeFloor(tier: Tier, kind: "event" | "briefing" = "event"): Date | null {
  if (tier !== "watch") return null;
  const hours = kind === "briefing" ? WATCH_BRIEFING_FLOOR_HOURS : WATCH_EVENT_FLOOR_HOURS;
  return new Date(Date.now() - hours * 3_600_000);
}

/** True when a record timestamp falls behind the floor (i.e. must be gated). */
export function isGatedByFloor(ts: Date | string, floor: Date | null): boolean {
  if (floor === null) return false;
  return new Date(ts).getTime() < floor.getTime();
}

/**
 * Cap a requested aggregate window for floored (watch) requests: anything
 * wider than the 7-day floor degrades to "7d". Null floor → unchanged.
 */
export function clampTimeRangeForFloor<T extends string>(
  timeRange: T,
  floor: Date | null,
): T | "7d" {
  if (floor === null) return timeRange;
  return timeRange === "30d" || timeRange === "all" ? "7d" : timeRange;
}

/** Badge label for the SensorStrip/HeaderBar tier chip. Signed-out → WATCH. */
export function tierLabel(tier: Tier | null | undefined): string {
  switch (tier) {
    case "analyst": return "Analyst Tier";
    case "bureau":  return "Bureau Tier";
    case "command": return "Command Tier";
    default:        return "Watch Tier";
  }
}

/**
 * The qualifying-status filter, byte-identical across the three consumers:
 *  - entitlements read (entitlements.ts)
 *  - founding cap guard (app/api/checkout/route.ts)
 *  - founding counter (app/pricing/page.tsx)
 */
export const QUALIFYING_STATUS_SQL = `status IN ('active', 'past_due', 'trialing')`;
