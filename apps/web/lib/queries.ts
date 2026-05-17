import { isDatabaseConfigured, query, queryOne } from "./db";
import * as ph from "@/data/placeholder";
import type {
  Stats,
  MapEvent,
  Alert,
  IntensityDay,
  Source,
  BriefingData,
  EventDetail,
  EventSource,
  FullBriefing,
  SourceDetail,
  Platform,
  EventType,
  Confidence,
  TheaterKey,
} from "@/data/placeholder";

// Bounding boxes [minLng, minLat, maxLng, maxLat] per theater for PostGIS filtering
const THEATER_BBOX: Record<TheaterKey, [number, number, number, number]> = {
  ukraine: [22, 44, 40, 52],
  iran:    [44, 25, 64, 40],
  sudan:   [21,  8, 42, 23],
  myanmar: [92,  9, 102, 29],
};

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

export type TimeRange = "24h" | "7d" | "30d";

const VALID_RANGES: TimeRange[] = ["24h", "7d", "30d"];

export function resolveTimeRange(raw: string | undefined): TimeRange {
  return VALID_RANGES.includes(raw as TimeRange) ? (raw as TimeRange) : "24h";
}

const SQL_INTERVALS: Record<TimeRange, string> = {
  "24h": "24 hours",
  "7d":  "7 days",
  "30d": "30 days",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesAgo(occurredAt: Date | string): number {
  const ts = typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt;
  return Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60_000));
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

function splitParagraphs(text: string | null): string[] {
  if (!text) return [];
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function fmtBriefingDate(ts: Date): string {
  return ts.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function fmtBriefingUTC(ts: Date): string {
  return ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getStats(theater: TheaterKey = "ukraine", timeRange: TimeRange = "24h"): Promise<Stats> {
  if (!isDatabaseConfigured()) return ph.phStats(theater);

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = {
      events: string | number;
      strikes: string | number;
      verified_pct: string | number | null;
      vs_7d_avg_pct: string | number | null;
    };

    const row = await queryOne<Row>(
      `
      WITH window_24h AS (
        SELECT *
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at > now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ),
      prev_7d AS (
        SELECT count(*)::float / 7.0 AS daily_avg
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at BETWEEN now() - INTERVAL '8 days' AND now() - INTERVAL '1 day'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      )
      SELECT
        (SELECT count(*) FROM window_24h)::int AS events,
        (SELECT count(*) FROM window_24h WHERE event_type = 'strike')::int AS strikes,
        (SELECT COALESCE(round(
           100.0 * count(*) FILTER (WHERE confidence = 'verified')::numeric
           / NULLIF(count(*), 0)
         ), 0)::int FROM window_24h) AS verified_pct,
        (SELECT COALESCE(round(
           100.0 * ((SELECT count(*) FROM window_24h)::numeric - daily_avg)
           / NULLIF(daily_avg, 0)
         ), 0)::int FROM prev_7d) AS vs_7d_avg_pct
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    if (!row) return ph.phStats(theater);
    if (Number(row.events) === 0) return { events: 0, strikes: 0, verified_pct: 0, vs_7d_avg_pct: 0 };

    return {
      events: Number(row.events) || 0,
      strikes: Number(row.strikes) || 0,
      verified_pct: Number(row.verified_pct) || 0,
      vs_7d_avg_pct: Number(row.vs_7d_avg_pct) || 0,
    };
  } catch {
    return ph.phStats(theater);
  }
}

// ---------------------------------------------------------------------------
// Map events (last 24h)
// ---------------------------------------------------------------------------

export async function getMapEvents(theater: TheaterKey = "ukraine", timeRange: TimeRange = "24h"): Promise<MapEvent[]> {
  if (!isDatabaseConfigured()) return ph.phMapEvents(theater);

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = {
      id: string;
      event_type: EventType;
      occurred_at: Date;
      lng: number;
      lat: number;
      location_name: string;
      oblast: string;
      description: string;
      confidence: Confidence;
      source_count: string | number;
    };

    const rows = await query<Row>(
      `
      SELECT
        e.id::text                AS id,
        e.event_type              AS event_type,
        e.occurred_at             AS occurred_at,
        ST_X(e.location)::float8  AS lng,
        ST_Y(e.location)::float8  AS lat,
        e.location_name           AS location_name,
        e.oblast                  AS oblast,
        e.description             AS description,
        e.confidence              AS confidence,
        COUNT(DISTINCT es.source_id)::int AS source_count
      FROM events e
      LEFT JOIN event_sources es ON es.event_id = e.id
      WHERE e.published_at IS NOT NULL
        AND e.occurred_at > now() - INTERVAL '${interval}'
        AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      GROUP BY e.id
      ORDER BY e.occurred_at DESC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return ph.phMapEvents(theater);

    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      occurred_at: new Date(r.occurred_at).toISOString(),
      lng: Number(r.lng),
      lat: Number(r.lat),
      location_name: r.location_name,
      oblast: r.oblast,
      description: r.description,
      confidence: r.confidence,
      source_count: Number(r.source_count) || 0,
      minutes_ago: minutesAgo(r.occurred_at),
    }));
  } catch {
    return ph.phMapEvents(theater);
  }
}

// ---------------------------------------------------------------------------
// Alerts (latest 3)
// ---------------------------------------------------------------------------

export async function getAlerts(theater: TheaterKey = "ukraine", limit = 3, timeRange: TimeRange = "24h"): Promise<Alert[]> {
  if (!isDatabaseConfigured()) return ph.phAlerts(theater);

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = {
      id: string;
      event_type: EventType;
      title: string;
      confidence: Confidence;
      source_count: string | number;
      occurred_at: Date;
    };

    const rows = await query<Row>(
      `
      SELECT
        e.id::text       AS id,
        e.event_type     AS event_type,
        CASE
          WHEN char_length(e.description) <= 80 THEN e.description
          ELSE initcap(e.event_type) || ' — ' || e.location_name
        END              AS title,
        e.confidence     AS confidence,
        COUNT(DISTINCT es.source_id)::int AS source_count,
        e.occurred_at    AS occurred_at
      FROM events e
      LEFT JOIN event_sources es ON es.event_id = e.id
      WHERE e.published_at IS NOT NULL
        AND e.occurred_at > now() - INTERVAL '${interval}'
        AND ST_Within(e.location, ST_MakeEnvelope($2, $3, $4, $5, 4326))
      GROUP BY e.id
      ORDER BY e.occurred_at DESC
      LIMIT $1
      `,
      [limit, minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return ph.phAlerts(theater);

    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      title: r.title,
      confidence: r.confidence,
      source_count: Number(r.source_count) || 0,
      minutes_ago: minutesAgo(r.occurred_at),
    }));
  } catch {
    return ph.phAlerts(theater);
  }
}

// ---------------------------------------------------------------------------
// Intensity (last 7 days)
// ---------------------------------------------------------------------------

export async function getIntensity(theater: TheaterKey = "ukraine"): Promise<IntensityDay[]> {
  if (!isDatabaseConfigured()) return ph.phIntensity(theater);

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];

  try {
    type Row = { day: Date; count: string | number };

    const rows = await query<Row>(
      `
      SELECT
        d.day::date AS day,
        COUNT(e.id)::int AS count
      FROM generate_series(
        (now() AT TIME ZONE 'UTC')::date - INTERVAL '6 days',
        (now() AT TIME ZONE 'UTC')::date,
        '1 day'::interval
      ) AS d(day)
      LEFT JOIN events e
        ON date_trunc('day', e.occurred_at AT TIME ZONE 'UTC') = d.day
       AND e.published_at IS NOT NULL
       AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      GROUP BY d.day
      ORDER BY d.day ASC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    const counts = rows.map((r) => Number(r.count) || 0);

    if (counts.every((c) => c === 0)) return ph.phIntensity(theater);

    const max = Math.max(1, ...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    return rows.map((r, i) => ({
      label: dayLabel(new Date(r.day)),
      value: Math.round((counts[i] / max) * 100),
      hot: counts[i] > avg * 1.25,
    }));
  } catch {
    return ph.phIntensity(theater);
  }
}

// ---------------------------------------------------------------------------
// Top sources (dashboard panel — top 5 by today's events)
// ---------------------------------------------------------------------------

export async function getTopSources(theater: TheaterKey = "ukraine", limit = 5): Promise<Source[]> {
  if (!isDatabaseConfigured()) return ph.phSources(theater);

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];

  try {
    type Row = {
      handle: string;
      display_name: string;
      platform: Platform;
      events_count: string | number;
      verified_rate: string | number | null;
    };

    const rows = await query<Row>(
      `
      SELECT
        s.handle                                    AS handle,
        s.display_name                              AS display_name,
        s.platform                                  AS platform,
        COALESCE(today.cnt, 0)::int                 AS events_count,
        COALESCE(sr.verified_rate_30d, 0)::int      AS verified_rate
      FROM sources s
      LEFT JOIN source_reliability sr ON sr.source_id = s.id
      LEFT JOIN (
        SELECT es.source_id, COUNT(DISTINCT es.event_id) AS cnt
        FROM event_sources es
        JOIN events e ON e.id = es.event_id
        WHERE e.occurred_at > now() - INTERVAL '24 hours'
          AND e.published_at IS NOT NULL
          AND ST_Within(e.location, ST_MakeEnvelope($2, $3, $4, $5, 4326))
        GROUP BY es.source_id
      ) today ON today.source_id = s.id
      WHERE s.is_active = true
      ORDER BY events_count DESC, verified_rate DESC
      LIMIT $1
      `,
      [limit, minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return ph.phSources(theater);

    return rows.map((r, i) => ({
      rank: i + 1,
      handle: r.handle,
      display_name: r.display_name,
      platform: r.platform,
      events_count: Number(r.events_count) || 0,
      verified_rate: Number(r.verified_rate) || 0,
    }));
  } catch {
    return ph.phSources(theater);
  }
}

// ---------------------------------------------------------------------------
// Latest briefing (dashboard preview)
// ---------------------------------------------------------------------------

interface BriefingRow {
  id: string;
  draft_text: string;
  published_text: string | null;
  status: "draft" | "published";
  event_ids: string[];
  published_at: Date | null;
  created_at: Date;
}

function rowToBriefing(r: BriefingRow, sourceCount: number): BriefingData {
  const ts = r.published_at ?? r.created_at;
  const text = r.status === "published" && r.published_text ? r.published_text : r.draft_text;
  return {
    id: r.id,
    date: fmtBriefingDate(new Date(ts)),
    utc_time: fmtBriefingUTC(new Date(ts)),
    source_count: sourceCount,
    reviewed: r.status === "published",
    paragraphs: splitParagraphs(text).slice(0, 2),
  };
}

export async function getLatestBriefing(theater: TheaterKey = "ukraine"): Promise<BriefingData | null> {
  if (!isDatabaseConfigured()) return ph.phBriefing(theater);

  try {
    const row = await queryOne<BriefingRow>(
      `
      SELECT id::text, draft_text, published_text, status, event_ids::text[], published_at, created_at
      FROM briefings
      WHERE theater = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [theater],
    );

    if (!row) return ph.phBriefing(theater);

    const countRow = await queryOne<{ count: string | number }>(
      `
      SELECT COUNT(DISTINCT es.source_id)::int AS count
      FROM event_sources es
      WHERE es.event_id = ANY($1::uuid[])
      `,
      [row.event_ids],
    );

    return rowToBriefing(row, Number(countRow?.count) || 0);
  } catch {
    return ph.phBriefing(theater);
  }
}

// ---------------------------------------------------------------------------
// Event detail
// ---------------------------------------------------------------------------

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  if (!isDatabaseConfigured()) return ph.getEventDetail(id);

  try {
    type EventRow = {
      id: string;
      event_type: EventType;
      occurred_at: Date;
      lng: number;
      lat: number;
      location_name: string;
      oblast: string;
      actor: string | null;
      description: string;
      confidence: Confidence;
      human_reviewed_at: Date | null;
      human_reviewer_notes: string | null;
      source_count: string | number;
    };

    const evt = await queryOne<EventRow>(
      `
      SELECT
        e.id::text                AS id,
        e.event_type              AS event_type,
        e.occurred_at             AS occurred_at,
        ST_X(e.location)::float8  AS lng,
        ST_Y(e.location)::float8  AS lat,
        e.location_name           AS location_name,
        e.oblast                  AS oblast,
        e.actor                   AS actor,
        e.description             AS description,
        e.confidence              AS confidence,
        e.human_reviewed_at       AS human_reviewed_at,
        e.human_reviewer_notes    AS human_reviewer_notes,
        COUNT(DISTINCT es.source_id)::int AS source_count
      FROM events e
      LEFT JOIN event_sources es ON es.event_id = e.id
      WHERE e.id = $1::uuid
        AND e.published_at IS NOT NULL
      GROUP BY e.id
      `,
      [id],
    );

    if (!evt) return null;

    type SourceRow = {
      id: string;
      handle: string;
      display_name: string;
      platform: Platform;
      url: string | null;
      trust_tier: number;
      posted_at: Date | null;
      text_excerpt: string | null;
      relationship: "primary" | "corroborating" | "contradicting";
    };

    const sources = await query<SourceRow>(
      `
      SELECT
        es.id::text       AS id,
        s.handle          AS handle,
        s.display_name    AS display_name,
        s.platform        AS platform,
        s.url             AS url,
        s.trust_tier      AS trust_tier,
        rp.posted_at      AS posted_at,
        rp.text           AS text_excerpt,
        es.relationship   AS relationship
      FROM event_sources es
      JOIN sources s ON s.id = es.source_id
      LEFT JOIN raw_posts rp ON rp.id = es.raw_post_id
      WHERE es.event_id = $1::uuid
      ORDER BY
        CASE es.relationship
          WHEN 'primary' THEN 1
          WHEN 'corroborating' THEN 2
          ELSE 3
        END,
        rp.posted_at ASC NULLS LAST
      `,
      [id],
    );

    const event_sources: EventSource[] = sources.map((r) => ({
      id: r.id,
      handle: r.handle,
      display_name: r.display_name,
      platform: r.platform,
      url: r.url ?? "",
      posted_at: (r.posted_at ?? new Date()).toISOString(),
      text_excerpt: r.text_excerpt
        ? r.text_excerpt.length > 280
          ? r.text_excerpt.slice(0, 277) + "…"
          : r.text_excerpt
        : "",
      relationship: r.relationship,
      trust_tier: (r.trust_tier as 1 | 2 | 3) ?? 2,
    }));

    return {
      id: evt.id,
      event_type: evt.event_type,
      occurred_at: new Date(evt.occurred_at).toISOString(),
      lng: Number(evt.lng),
      lat: Number(evt.lat),
      location_name: evt.location_name,
      oblast: evt.oblast,
      description: evt.description,
      confidence: evt.confidence,
      source_count: Number(evt.source_count) || event_sources.length,
      minutes_ago: minutesAgo(evt.occurred_at),
      actor: evt.actor,
      human_reviewed_at: evt.human_reviewed_at ? new Date(evt.human_reviewed_at).toISOString() : null,
      human_reviewer_notes: evt.human_reviewer_notes,
      event_sources,
      evidence: [],
      change_history: [
        { timestamp: new Date(evt.occurred_at).toISOString(), change: "Event created from OSINT source." },
        ...(evt.human_reviewed_at
          ? [{
              timestamp: new Date(evt.human_reviewed_at).toISOString(),
              change: `Human review complete — confidence: ${evt.confidence}`,
            }]
          : []),
      ],
    };
  } catch {
    return ph.getEventDetail(id);
  }
}

// ---------------------------------------------------------------------------
// Full briefing
// ---------------------------------------------------------------------------

export async function getFullBriefing(id: string): Promise<FullBriefing | null> {
  if (!isDatabaseConfigured()) return ph.getFullBriefing(id);

  try {
    const row = await queryOne<BriefingRow>(
      `
      SELECT id::text, draft_text, published_text, status, event_ids::text[], published_at, created_at
      FROM briefings
      WHERE id = $1::uuid
      `,
      [id],
    );

    if (!row) return null;

    const text = row.status === "published" && row.published_text ? row.published_text : row.draft_text;
    const fullParagraphs = splitParagraphs(text);
    const ts = row.published_at ?? row.created_at;

    type SummaryRow = {
      confidence: Confidence;
      count: string | number;
    };

    const summary = await query<SummaryRow>(
      `
      SELECT confidence, COUNT(*)::int AS count
      FROM events
      WHERE id = ANY($1::uuid[])
      GROUP BY confidence
      `,
      [row.event_ids],
    );

    const confidence_summary = { verified: 0, partial: 0, unconfirmed: 0 };
    for (const s of summary) {
      confidence_summary[s.confidence] = Number(s.count) || 0;
    }

    const sourceCountRow = await queryOne<{ count: string | number }>(
      `
      SELECT COUNT(DISTINCT es.source_id)::int AS count
      FROM event_sources es
      WHERE es.event_id = ANY($1::uuid[])
      `,
      [row.event_ids],
    );

    return {
      id: row.id,
      date: fmtBriefingDate(new Date(ts)),
      utc_time: fmtBriefingUTC(new Date(ts)),
      source_count: Number(sourceCountRow?.count) || 0,
      reviewed: row.status === "published",
      paragraphs: fullParagraphs.slice(0, 2),
      full_paragraphs: fullParagraphs,
      referenced_event_ids: row.event_ids,
      confidence_summary,
    };
  } catch {
    return ph.getFullBriefing(id);
  }
}

// ---------------------------------------------------------------------------
// Data liveness status — used by the demo banner
// ---------------------------------------------------------------------------

export type DataStatus = "live" | "no-db" | "db-empty";

export async function getLiveDataStatus(): Promise<DataStatus> {
  if (!isDatabaseConfigured()) return "no-db";
  try {
    const row = await queryOne<{ count: string }>(
      `SELECT count(*)::int AS count FROM events WHERE published_at IS NOT NULL`,
    );
    return Number(row?.count) > 0 ? "live" : "db-empty";
  } catch {
    return "db-empty";
  }
}

// ---------------------------------------------------------------------------
// All sources (sources page)
// ---------------------------------------------------------------------------

export async function getAllSources(): Promise<SourceDetail[]> {
  if (!isDatabaseConfigured()) return ph.allSources;

  try {
    type Row = {
      handle: string;
      display_name: string;
      platform: Platform;
      url: string | null;
      trust_tier: number;
      notes: string | null;
      verified_rate: string | number;
      events_30d: string | number;
      last_event_at: Date | null;
      events_today: string | number;
      events_7d: string | number;
    };

    const rows = await query<Row>(`
      SELECT
        s.handle                                AS handle,
        s.display_name                          AS display_name,
        s.platform                              AS platform,
        s.url                                   AS url,
        s.trust_tier                            AS trust_tier,
        s.notes                                 AS notes,
        COALESCE(sr.verified_rate_30d, 0)::int  AS verified_rate,
        COALESCE(sr.events_30d, 0)::int         AS events_30d,
        sr.last_event_at                        AS last_event_at,
        COALESCE(today.cnt, 0)::int             AS events_today,
        COALESCE(week.cnt, 0)::int              AS events_7d
      FROM sources s
      LEFT JOIN source_reliability sr ON sr.source_id = s.id
      LEFT JOIN (
        SELECT es.source_id, COUNT(DISTINCT es.event_id) AS cnt
        FROM event_sources es
        JOIN events e ON e.id = es.event_id
        WHERE e.occurred_at > now() - INTERVAL '24 hours'
          AND e.published_at IS NOT NULL
        GROUP BY es.source_id
      ) today ON today.source_id = s.id
      LEFT JOIN (
        SELECT es.source_id, COUNT(DISTINCT es.event_id) AS cnt
        FROM event_sources es
        JOIN events e ON e.id = es.event_id
        WHERE e.occurred_at > now() - INTERVAL '7 days'
          AND e.published_at IS NOT NULL
        GROUP BY es.source_id
      ) week ON week.source_id = s.id
      WHERE s.is_active = true
      ORDER BY events_30d DESC, verified_rate DESC, s.handle ASC
    `);

    return rows.map((r, i) => ({
      rank: i + 1,
      handle: r.handle,
      display_name: r.display_name,
      platform: r.platform,
      events_count: Number(r.events_today) || 0,
      verified_rate: Number(r.verified_rate) || 0,
      url: r.url ?? "",
      events_7d: Number(r.events_7d) || 0,
      events_30d: Number(r.events_30d) || 0,
      last_event_at: r.last_event_at ? new Date(r.last_event_at).toISOString() : new Date(0).toISOString(),
      trust_tier: (r.trust_tier as 1 | 2 | 3) ?? 2,
      notes: r.notes ?? "",
    }));
  } catch {
    return ph.allSources;
  }
}
