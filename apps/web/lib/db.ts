/**
 * Shared PostgreSQL pool for the Next.js server.
 *
 * All query functions gracefully return empty/zero data when DATABASE_URL is
 * unset, so the dashboard still renders during local development without a DB.
 */
import { Pool } from "pg";

import type {
  MapEvent,
  Alert,
  IntensityDay,
  Source,
  Stats,
  BriefingData,
} from "@/data/placeholder";

// ---------------------------------------------------------------------------
// Pool — singleton per process
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

function pool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return _pool;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Events within a bounding box and time window. Powers the map and alerts. */
export async function queryEvents(opts: {
  minLng?: number;
  minLat?: number;
  maxLng?: number;
  maxLat?: number;
  hours?: number;
}): Promise<MapEvent[]> {
  const db = pool();
  if (!db) return [];

  const {
    minLng = 22,
    minLat = 44,
    maxLng = 41,
    maxLat = 53,
    hours = 24,
  } = opts;

  try {
    const { rows } = await db.query<{
      id: string;
      event_type: string;
      occurred_at: Date;
      lng: number;
      lat: number;
      location_name: string;
      oblast: string;
      description: string;
      confidence: string;
      source_count: string;
    }>(
      `SELECT * FROM events_in_bbox($1,$2,$3,$4,
         now() - ($5 || ' hours')::interval, now())`,
      [minLng, minLat, maxLng, maxLat, hours]
    );

    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type as MapEvent["event_type"],
      occurred_at: r.occurred_at.toISOString(),
      lat: Number(r.lat),
      lng: Number(r.lng),
      location_name: r.location_name,
      oblast: r.oblast,
      description: r.description,
      confidence: r.confidence as MapEvent["confidence"],
      source_count: Number(r.source_count),
      minutes_ago: Math.round((now - r.occurred_at.getTime()) / 60_000),
    }));
  } catch {
    return [];
  }
}

/** At-a-glance stats: event counts, verified %, vs 7-day average. */
export async function queryStats(): Promise<Stats> {
  const db = pool();
  if (!db) return { events: 0, strikes: 0, verified_pct: 0, vs_7d_avg_pct: 0 };

  try {
    const { rows } = await db.query<{
      total: string;
      strikes: string;
      verified: string;
      avg_7d: string;
    }>(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE event_type = 'strike')    AS strikes,
        COUNT(*) FILTER (WHERE confidence = 'verified')  AS verified,
        COALESCE(
          (SELECT COUNT(*)::numeric / 7
           FROM events
           WHERE occurred_at > now() - interval '8 days'
             AND occurred_at < now() - interval '1 day'
             AND published_at IS NOT NULL),
          0
        )                                                AS avg_7d
      FROM events
      WHERE occurred_at > now() - interval '24 hours'
        AND published_at IS NOT NULL
    `);

    const r = rows[0];
    const total = Number(r.total);
    const verified = Number(r.verified);
    const avg7d = Number(r.avg_7d);

    return {
      events: total,
      strikes: Number(r.strikes),
      verified_pct: total > 0 ? Math.round((verified / total) * 100) : 0,
      vs_7d_avg_pct:
        avg7d > 0 ? Math.round(((total - avg7d) / avg7d) * 100) : 0,
    };
  } catch {
    return { events: 0, strikes: 0, verified_pct: 0, vs_7d_avg_pct: 0 };
  }
}

/** Latest published briefing, or the latest draft if nothing is published. */
export async function queryLatestBriefing(): Promise<BriefingData | null> {
  const db = pool();
  if (!db) return null;

  try {
    const { rows } = await db.query<{
      id: string;
      draft_text: string;
      published_text: string | null;
      status: string;
      period_start: Date;
      period_end: Date;
      event_ids: string[];
      created_at: Date;
    }>(`
      SELECT id, draft_text, published_text, status,
             period_start, period_end, event_ids, created_at
      FROM briefings
      ORDER BY
        (status = 'published') DESC,
        created_at DESC
      LIMIT 1
    `);

    if (!rows.length) return null;
    const r = rows[0];

    const text = r.published_text ?? r.draft_text;
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const d = r.period_end;
    const date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const utcTime =
      d.getUTCHours().toString().padStart(2, "0") +
      ":" +
      d.getUTCMinutes().toString().padStart(2, "0") +
      " UTC";

    return {
      id: r.id,
      date,
      utc_time: utcTime,
      source_count: r.event_ids.length,
      reviewed: r.status === "published",
      paragraphs,
    };
  } catch {
    return null;
  }
}

/** Top sources by 24-hour contribution, from the source_reliability view. */
export async function querySources(): Promise<Source[]> {
  const db = pool();
  if (!db) return [];

  try {
    const { rows } = await db.query<{
      handle: string;
      display_name: string;
      platform: string;
      events_24h: string;
      verified_rate_30d: string;
    }>(`
      SELECT
        sr.handle,
        sr.display_name,
        sr.platform,
        COUNT(DISTINCT es.event_id)
          FILTER (WHERE e.occurred_at > now() - interval '24 hours')
                                  AS events_24h,
        sr.verified_rate_30d
      FROM source_reliability sr
      LEFT JOIN event_sources es ON es.source_id = sr.source_id
      LEFT JOIN events e         ON e.id = es.event_id
      WHERE sr.events_30d > 0
      GROUP BY sr.source_id, sr.handle, sr.display_name,
               sr.platform, sr.verified_rate_30d
      ORDER BY events_24h DESC, sr.verified_rate_30d DESC
      LIMIT 10
    `);

    return rows.map((r, i) => ({
      rank: i + 1,
      handle: r.handle,
      display_name: r.display_name,
      platform: r.platform as Source["platform"],
      events_count: Number(r.events_24h),
      verified_rate: Number(r.verified_rate_30d),
    }));
  } catch {
    return [];
  }
}

/** Per-day event count for the last 7 days (for the intensity bar chart). */
export async function queryIntensity(): Promise<IntensityDay[]> {
  const db = pool();
  if (!db) return [];

  try {
    const { rows } = await db.query<{ day: Date; count: string }>(`
      SELECT
        date_trunc('day', occurred_at AT TIME ZONE 'UTC') AS day,
        COUNT(*)                                          AS count
      FROM events
      WHERE occurred_at > now() - interval '7 days'
        AND published_at IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    if (!rows.length) return [];

    const counts = rows.map((r) => Number(r.count));
    const max = Math.max(...counts, 1);

    return rows.map((r) => {
      const count = Number(r.count);
      const value = Math.round((count / max) * 100);
      return {
        label: r.day.toLocaleDateString("en-GB", { weekday: "short" }),
        value,
        hot: value >= 75,
      };
    });
  } catch {
    return [];
  }
}
