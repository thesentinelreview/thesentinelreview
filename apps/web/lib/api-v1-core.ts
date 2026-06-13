// Read API v1 — pure logic (no I/O). Server wiring in lib/api-v1.ts.
import { createHash, randomBytes } from "crypto";
import type { Tier } from "./entitlements-core";
import { WEAPON_TYPES, type WeaponType } from "./types";

export const API_KEY_PREFIX = "snl_live_";
export const API_KEY_RANDOM_CHARS = 32;
export const KEY_PREFIX_DISPLAY_CHARS = 12;

/** Per-UTC-day call limits. Tier re-derived live per request — never baked
 * into the key. bureau is pre-wired but unreachable until the tier exists;
 * admin (staff) gets the bureau ceiling. */
export const API_DAILY_LIMITS: Partial<Record<Tier, number>> = {
  analyst: 1_000,
  bureau: 25_000,
  admin: 25_000,
};

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // 24 random bytes → exactly 32 base64url chars, crypto-strength.
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, KEY_PREFIX_DISPLAY_CHARS) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isWellFormedApiKey(key: string): boolean {
  return new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{${API_KEY_RANDOM_CHARS}}$`).test(key);
}

/** Increment-then-check metering: counts 1..limit are allowed; limit+1 → 429. */
export function rateLimitState(countAfterIncrement: number, limit: number) {
  return {
    allowed: countAfterIncrement <= limit,
    remaining: Math.max(0, limit - countAfterIncrement),
  };
}

/** Next UTC midnight as epoch seconds — the X-RateLimit-Reset value. */
export function utcMidnightResetEpoch(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000);
}

// ---- request-param validation (422 on failure) ----------------------------

export type ParamError = { code: "invalid_parameter"; message: string };

export function parseIsoParam(name: string, raw: string | null): Date | null | ParamError {
  if (raw === null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { code: "invalid_parameter", message: `${name} must be an ISO 8601 timestamp` };
  }
  return d;
}

export function parseLimitParam(raw: string | null, max = 200, fallback = 50): number | ParamError {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    return { code: "invalid_parameter", message: `limit must be an integer between 1 and ${max}` };
  }
  return n;
}

export const CONFIDENCE_ORDER = ["unconfirmed", "partial", "verified"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_ORDER)[number];

export function confidencesAtOrAbove(min: string): ConfidenceBand[] | ParamError {
  const idx = CONFIDENCE_ORDER.indexOf(min as ConfidenceBand);
  if (idx === -1) {
    return { code: "invalid_parameter", message: `min_confidence must be one of ${CONFIDENCE_ORDER.join(", ")}` };
  }
  return CONFIDENCE_ORDER.slice(idx) as unknown as ConfidenceBand[];
}

/** Threat-axis filter. Vocabulary is the WEAPON_TYPES mirror in lib/types.ts
 * (canon: apps/ingest/sentinel/models.py) — never a third copy. NULL rows are
 * unfilterable by design: the param selects a kinetic class, and NULL means no
 * identifiable kinetic capability. */
export function parseWeaponTypeParam(raw: string | null): WeaponType | null | ParamError {
  if (raw === null || raw === "") return null;
  if (!(WEAPON_TYPES as readonly string[]).includes(raw)) {
    return { code: "invalid_parameter", message: `weapon_type must be one of ${WEAPON_TYPES.join(", ")}` };
  }
  return raw as WeaponType;
}

export const GROUP_BY_VALUES = ["event_type", "theater", "confidence_band", "weapon_type"] as const;

// ---- keyset cursor on (occurred_at desc, id desc) --------------------------

export interface EventCursor { occurredAt: string; id: string }

export function encodeCursor(c: EventCursor): string {
  return Buffer.from(`${c.occurredAt}|${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string): EventCursor | ParamError {
  try {
    const [occurredAt, id] = Buffer.from(raw, "base64url").toString().split("|");
    if (!occurredAt || !id || Number.isNaN(new Date(occurredAt).getTime())) throw new Error();
    return { occurredAt, id };
  } catch {
    return { code: "invalid_parameter", message: "cursor is not valid" };
  }
}

/** Reference comparator mirroring the SQL keyset predicate
 * `(occurred_at, id) < (cursor.occurredAt, cursor.id)` for stability tests. */
export function isAfterCursor(row: EventCursor, cursor: EventCursor): boolean {
  if (row.occurredAt !== cursor.occurredAt) return row.occurredAt < cursor.occurredAt;
  return row.id < cursor.id;
}
