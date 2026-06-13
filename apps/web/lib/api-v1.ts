// Read API v1 — server wiring: bearer auth, live entitlement re-derivation,
// metering, shared response helpers. Pure logic lives in api-v1-core.ts.
import { query, queryOne } from "./db";
import { getEntitlementsForUser, type Entitlements } from "./entitlements";
import {
  API_DAILY_LIMITS,
  hashApiKey,
  isWellFormedApiKey,
  rateLimitState,
  utcMidnightResetEpoch,
} from "./api-v1-core";

export interface RateInfo { limit: number; remaining: number; reset: number }

export type ApiAuth =
  | { ok: true; keyId: string; clerkUserId: string; entitlements: Entitlements; rate: RateInfo }
  | { ok: false; status: number; code: string; message: string; rate?: RateInfo };

export function rateHeaders(rate?: RateInfo): Record<string, string> {
  if (!rate) return {};
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.reset),
  };
}

export function jsonOk(body: unknown, rate?: RateInfo): Response {
  return Response.json(body, { headers: rateHeaders(rate) });
}

export function jsonError(status: number, code: string, message: string, rate?: RateInfo): Response {
  return Response.json({ error: message, code }, { status, headers: rateHeaders(rate) });
}

/**
 * Authenticate a /api/v1/* request: Bearer key → hash lookup (not revoked) →
 * LIVE entitlement re-derivation (grants > subscription > watch — the shared
 * lib) → canUseApi gate → atomic daily metering. 401/403 are not metered.
 */
export async function authenticateApiRequest(req: Request): Promise<ApiAuth> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key || !isWellFormedApiKey(key)) {
    return { ok: false, status: 401, code: "invalid_key", message: "Provide an API key: Authorization: Bearer snl_live_…" };
  }

  const row = await queryOne<{ id: string; clerk_user_id: string }>(
    `SELECT id::text, clerk_user_id FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [hashApiKey(key)],
  );
  if (!row) {
    return { ok: false, status: 401, code: "invalid_key", message: "Unknown or revoked API key." };
  }

  // Tier is never baked into the key: re-derive on every request.
  const entitlements = await getEntitlementsForUser(row.clerk_user_id);
  const limit = API_DAILY_LIMITS[entitlements.tier];
  if (!entitlements.canUseApi || !limit) {
    return {
      ok: false, status: 403, code: "tier_insufficient",
      message: "API access requires an active Analyst subscription. Manage your plan at https://dashboard.thesentinelreview.com/pricing",
    };
  }

  // Atomic upsert-increment; counts 1..limit allowed, limit+1 → 429.
  const usage = await queryOne<{ count: number }>(
    `INSERT INTO api_usage (key_id, usage_date, count)
     VALUES ($1::uuid, (now() AT TIME ZONE 'utc')::date, 1)
     ON CONFLICT (key_id, usage_date) DO UPDATE SET count = api_usage.count + 1
     RETURNING count`,
    [row.id],
  );
  const count = usage?.count ?? 1;
  const { allowed, remaining } = rateLimitState(count, limit);
  const rate: RateInfo = { limit, remaining, reset: utcMidnightResetEpoch() };

  // last_used_at, throttled to one write per minute per key.
  query(
    `UPDATE api_keys SET last_used_at = now()
     WHERE id = $1::uuid AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
    [row.id],
  ).catch(() => {});

  if (!allowed) {
    return { ok: false, status: 429, code: "rate_limited", message: `Daily limit of ${limit} calls reached. Resets at UTC midnight.`, rate };
  }
  return { ok: true, keyId: row.id, clerkUserId: row.clerk_user_id, entitlements, rate };
}

// ---- shared SQL fragments ---------------------------------------------------

// Theater derivation from event coordinates against the five canonical bboxes.
// israel is checked FIRST (its box sits inside iran's wide box); remaining
// overlaps resolve by listed precedence. Documented in /docs/api — fully
// deterministic and recomputable. Keep in sync with lib/queries.ts THEATER_BBOX.
export const THEATER_CASE_SQL = `CASE
  WHEN ST_Within(e.location, ST_MakeEnvelope(34.2, 29.4, 35.9, 33.1, 4326)) THEN 'israel'
  WHEN ST_Within(e.location, ST_MakeEnvelope(19, 53, 29, 60, 4326))          THEN 'nato_flank'
  WHEN ST_Within(e.location, ST_MakeEnvelope(21, 8, 42, 23, 4326))           THEN 'sudan'
  WHEN ST_Within(e.location, ST_MakeEnvelope(32, 10, 64, 42, 4326))
       AND NOT ST_Within(e.location, ST_MakeEnvelope(34.2, 29.4, 35.9, 33.1, 4326)) THEN 'iran'
  WHEN ST_Within(e.location, ST_MakeEnvelope(92, 9, 102, 29, 4326))          THEN 'myanmar'
  WHEN ST_Within(e.location, ST_MakeEnvelope(22, 44, 40, 52, 4326))          THEN 'ukraine'
  WHEN ST_Within(e.location, ST_MakeEnvelope(28, 41, 140, 68, 4326))
       AND NOT ST_Within(e.location, ST_MakeEnvelope(22, 44, 40, 52, 4326))  THEN 'russia'
  ELSE 'other'
END`;

export const API_THEATERS = ["ukraine", "iran", "sudan", "myanmar", "israel", "russia", "nato_flank"] as const;
