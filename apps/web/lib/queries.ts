import { isDatabaseConfigured, query, queryOne } from "./db";
import {
  briefingPreviewParagraphs,
  parseBriefingSections,
  splitParagraphs,
} from "./briefing-format";
import {
  getRequestEntitlements,
  tierTimeFloor,
  clampTimeRangeForFloor,
  isGatedByFloor,
} from "./entitlements";
import type {
  Stats,
  SensorStripData,
  MapEvent,
  Alert,
  IntensityDay,
  Sector,
  ThreatAxes,
  WeaponType,
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
} from "@/lib/types";
import { PILL_WINDOW_MINUTES } from "@/lib/types";

// Bounding boxes [minLng, minLat, maxLng, maxLat] per theater for PostGIS filtering.
// israel is the homeland box (Israel + Gaza + West Bank). It sits INSIDE the wide
// iran box, so iran membership subtracts it (see israelCarveOut) to keep the two
// theaters mutually exclusive: Israel/Gaza/West Bank events surface under israel
// only, never also under iran. Kept in sync with apps/ingest/sentinel/db.py
// (_THEATER_BBOX + _iran_israel_carve_sql).
const THEATER_BBOX: Record<TheaterKey, [number, number, number, number]> = {
  ukraine:    [22, 44, 40, 52],
  iran:       [32, 10, 64, 42],
  sudan:      [21,  8, 42, 23],
  myanmar:    [92,  9, 102, 29],
  israel:     [34.2, 29.4, 35.9, 33.1],
  russia:     [28, 41, 140, 68],
  nato_flank: [19, 53,  29, 60],
};

// SQL fragment that, for the iran theater only, excludes the israel homeland box
// so Israel/Gaza/West Bank events do not also count under iran. Empty for every
// other theater. The bbox coords are hardcoded trusted constants (never user
// input), so inlining them in SQL is safe.
function israelCarveOut(col: string, theater: TheaterKey | "all"): string {
  if (theater !== "iran") return "";
  const [a, b, c, d] = THEATER_BBOX.israel;
  return ` AND NOT ST_Within(${col}, ST_MakeEnvelope(${a}, ${b}, ${c}, ${d}, 4326))`;
}

// For the russia theater, carve out the ukraine bbox so border events stay in
// ukraine (ukraine takes precedence; russia bbox is a superset). Mirrors
// israelCarveOut. Empty for every other theater.
function russiaCarveOut(col: string, theater: TheaterKey | "all"): string {
  if (theater !== "russia") return "";
  const [a, b, c, d] = THEATER_BBOX.ukraine;
  return ` AND NOT ST_Within(${col}, ST_MakeEnvelope(${a}, ${b}, ${c}, ${d}, 4326))`;
}

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

export type TimeRange = "24h" | "7d" | "30d";

const VALID_RANGES: TimeRange[] = ["24h", "7d", "30d"];

export function resolveTimeRange(raw: string | undefined): TimeRange {
  return VALID_RANGES.includes(raw as TimeRange) ? (raw as TimeRange) : "24h";
}

// Which view the Sector Threat panel shows. "sectors" (oblast breakdown) is the
// default so a bookmarked URL with no `threat` param is unchanged. "intensity"
// surfaces the activity-intensity chart as a third tab in the same panel.
export type ThreatView = "sectors" | "axes" | "intensity";

export function resolveThreatView(raw: string | undefined): ThreatView {
  if (raw === "axes") return "axes";
  if (raw === "intensity") return "intensity";
  return "sectors";
}

// Which view the Active Alerts / Top Sources panel shows. "alerts" is the
// default so a bookmarked URL with no `feed` param is unchanged.
export type FeedView = "alerts" | "sources";

export function resolveFeedView(raw: string | undefined): FeedView {
  return raw === "sources" ? "sources" : "alerts";
}

// The /admin/tieout page exposes 24h/7d/30d plus an all-time option. "all" skips
// the occurred_at lower bound entirely so the page can report lifetime fusion
// metrics.
export type TieoutWindow = "24h" | "7d" | "30d" | "all";

export function resolveTieoutWindow(raw: string | undefined): TieoutWindow {
  return raw === "7d" ? "7d" : raw === "30d" ? "30d" : raw === "all" ? "all" : "24h";
}

const SQL_INTERVALS: Record<TimeRange, string> = {
  "24h": "24 hours",
  "7d":  "7 days",
  "30d": "30 days",
};

const WINDOW_DAYS: Record<TimeRange, number> = {
  "24h": 1,
  "7d":  7,
  "30d": 30,
};

// SQL fragment for the events.occurred_at lower bound, shared by the fusion +
// tie-out queries so they filter identically. Empty for "all" (no lower bound).
// The interpolated interval is a hardcoded constant, never user input.
function occurredAtClause(window: TimeRange | "all"): string {
  return window === "all"
    ? ""
    : `AND e.occurred_at > now() - INTERVAL '${SQL_INTERVALS[window]}'`;
}

// ---------------------------------------------------------------------------
// Tier time-clamp chokepoint (W1-2)
//
// Every event/post/briefing read in this module routes through these helpers.
// Watch tier (anonymous, no subscription, or non-qualifying status) is floored
// to 7 days of events/posts and 24 hours of briefings; analyst+ is unbounded.
// The clamp lives HERE — in the query layer — so pages, RSC payloads, and API
// routes cannot leak around it. Per-request memoized (one entitlements query
// per render) via React cache() inside getRequestEntitlements.
// ---------------------------------------------------------------------------

async function requestFloors(): Promise<{ event: Date | null; briefing: Date | null }> {
  const ent = await getRequestEntitlements();
  return {
    event: tierTimeFloor(ent.tier, "event"),
    briefing: tierTimeFloor(ent.tier, "briefing"),
  };
}

// Cap a requested aggregate window to the viewer's floor (watch: 30d/all → 7d).
async function clampedRange(timeRange: TimeRange): Promise<TimeRange> {
  const { event } = await requestFloors();
  return clampTimeRangeForFloor(timeRange, event) as TimeRange;
}

async function clampedWindow<T extends TimeRange | "all">(window: T): Promise<T | "7d"> {
  const { event } = await requestFloors();
  return clampTimeRangeForFloor(window, event) as T | "7d";
}

// Theater id accepted by the tie-out functions: the four real theaters plus
// "all" (Global), which unions the four bboxes. "all" is opt-in by /admin/tieout
// only — the watchfloor (/) and feed never pass it, so TheaterKey is unchanged.
export type TieoutTheater = TheaterKey | "all";

// PostGIS bbox predicate + positional params for a tie-out query. For "all" it
// emits an OR-union of the five theater bboxes (ST_Within against any counts).
// The iran box has the israel homeland box carved out of it so the two stay
// mutually exclusive. References the `e` alias on events. Callers either select
// DISTINCT e.id or GROUP BY e.id, so an event inside two overlapping bboxes is
// never double-counted.
function theaterPredicate(theater: TieoutTheater): { sql: string; params: number[] } {
  const keys: TheaterKey[] =
    theater === "all" ? ["ukraine", "iran", "sudan", "myanmar", "israel", "russia", "nato_flank"] : [theater];
  const parts: string[] = [];
  const params: number[] = [];
  let i = 1;
  for (const key of keys) {
    const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[key];
    parts.push(
      `(ST_Within(e.location, ST_MakeEnvelope($${i++}, $${i++}, $${i++}, $${i++}, 4326))${israelCarveOut("e.location", key)}${russiaCarveOut("e.location", key)})`,
    );
    params.push(minLng, minLat, maxLng, maxLat);
  }
  return { sql: parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0], params };
}

// Per-row theater label for the tie-out rows under the "all" (Global) view.
// Walks the same bboxes as theaterPredicate; israel is checked first so the
// iran carve-out (israel's homeland box sits inside the wide iran box) holds
// without repeating the NOT clause. Where two boxes overlap elsewhere (e.g.
// the iran/sudan Red Sea corner), the first listed wins — deterministic, and
// faithful to the same any-box membership the Global filter uses. The bbox
// coords are hardcoded trusted constants (never user input), as in
// israelCarveOut above.
function theaterLabelCase(col: string): string {
  const keys: TheaterKey[] = ["israel", "nato_flank", "sudan", "iran", "myanmar", "ukraine", "russia"];
  const whens = keys.map((k) => {
    const [a, b, c, d] = THEATER_BBOX[k];
    return `WHEN ST_Within(${col}, ST_MakeEnvelope(${a}, ${b}, ${c}, ${d}, 4326)) THEN '${k}'`;
  });
  return `CASE ${whens.join(" ")} ELSE 'other' END`;
}

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
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return { events: 0, strikes: 0, contacts: 0, movements: 0, verified_pct: 0, vs_7d_avg_pct: 0 };

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval   = SQL_INTERVALS[timeRange];
  const windowDays = WINDOW_DAYS[timeRange];

  try {
    type Row = {
      events: string | number;
      strikes: string | number;
      contacts: string | number;
      movements: string | number;
      verified_pct: string | number | null;
      vs_7d_avg_pct: string | number | null;
    };

    const row = await queryOne<Row>(
      `
      WITH window_events AS (
        SELECT *
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at > now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
      ),
      prev_7d AS (
        SELECT count(*)::float / 7.0 AS daily_avg
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at BETWEEN now() - INTERVAL '8 days' AND now() - INTERVAL '1 day'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
      )
      SELECT
        (SELECT count(*) FROM window_events)::int AS events,
        (SELECT count(*) FROM window_events WHERE event_type = 'strike')::int AS strikes,
        (SELECT count(*) FROM window_events WHERE event_type = 'clash')::int AS contacts,
        (SELECT count(*) FROM window_events WHERE event_type = 'movement')::int AS movements,
        (SELECT COALESCE(round(
           100.0 * count(*) FILTER (WHERE confidence = 'verified')::numeric
           / NULLIF(count(*), 0)
         ), 0)::int FROM window_events) AS verified_pct,
        (SELECT COALESCE(round(
           100.0 * ((SELECT count(*) FROM window_events)::numeric / $5::numeric - daily_avg)
           / NULLIF(daily_avg, 0)
         ), 0)::int FROM prev_7d) AS vs_7d_avg_pct
      `,
      [minLng, minLat, maxLng, maxLat, windowDays],
    );

    if (!row) return { events: 0, strikes: 0, contacts: 0, movements: 0, verified_pct: 0, vs_7d_avg_pct: 0 };
    if (Number(row.events) === 0) return { events: 0, strikes: 0, contacts: 0, movements: 0, verified_pct: 0, vs_7d_avg_pct: 0 };

    return {
      events: Number(row.events) || 0,
      strikes: Number(row.strikes) || 0,
      contacts: Number(row.contacts) || 0,
      movements: Number(row.movements) || 0,
      verified_pct: Number(row.verified_pct) || 0,
      vs_7d_avg_pct: Number(row.vs_7d_avg_pct) || 0,
    };
  } catch {
    return { events: 0, strikes: 0, contacts: 0, movements: 0, verified_pct: 0, vs_7d_avg_pct: 0 };
  }
}

// ---------------------------------------------------------------------------
// KPI strip — sparkline buckets + prior-window deltas
// ---------------------------------------------------------------------------

// Per-metric bucket counts for the KPI sparklines: 24 hourly buckets in 24h
// mode, one daily bucket per day otherwise. Generalizes getIntensity's
// generate_series / date_trunc pattern. Buckets EVENTS, STRIKES, and VERIFIED.
//
// RETAINED, CURRENTLY UNCALLED: the KPI-rail sparklines were removed in P2.E
// (the bars didn't communicate their meaning at that size). This query is kept
// intact so the sparklines can be reinstated with a different design without
// rebuilding the data layer; it is intentionally not referenced by the app.
export type KpiSparklines = { events: number[]; strikes: number[]; verified: number[] };

export async function getKpiSparklines(
  theater: TheaterKey = "ukraine",
  timeRange: TimeRange = "24h",
): Promise<KpiSparklines> {
  timeRange = await clampedRange(timeRange);
  const empty: KpiSparklines = { events: [], strikes: [], verified: [] };
  if (!isDatabaseConfigured()) return empty;

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  // unit/step/span are derived from the whitelisted timeRange, never user input.
  const unit = timeRange === "24h" ? "hour" : "day";
  const step = timeRange === "24h" ? "1 hour" : "1 day";
  const span = timeRange === "24h" ? "23 hours" : timeRange === "7d" ? "6 days" : "29 days";

  try {
    type Row = { events: string | number; strikes: string | number; verified: string | number };

    const rows = await query<Row>(
      `
      SELECT
        COUNT(e.id)::int AS events,
        COUNT(e.id) FILTER (WHERE e.event_type = 'strike')::int AS strikes,
        COUNT(e.id) FILTER (WHERE e.confidence = 'verified')::int AS verified
      FROM generate_series(
        date_trunc('${unit}', now() AT TIME ZONE 'UTC') - INTERVAL '${span}',
        date_trunc('${unit}', now() AT TIME ZONE 'UTC'),
        '${step}'::interval
      ) AS g(bucket)
      LEFT JOIN events e
        ON date_trunc('${unit}', e.occurred_at AT TIME ZONE 'UTC') = g.bucket
       AND e.published_at IS NOT NULL
       AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("e.location", theater)}
      GROUP BY g.bucket
      ORDER BY g.bucket ASC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    return {
      events: rows.map((r) => Number(r.events) || 0),
      strikes: rows.map((r) => Number(r.strikes) || 0),
      verified: rows.map((r) => Number(r.verified) || 0),
    };
  } catch {
    return empty;
  }
}

// Current vs. prior-window aggregates for the non-spark KPI deltas. The prior
// window is the equal-length span immediately before the current one (mirrors
// getSectors' prev-window comparison). Active sectors = distinct real oblasts.
export type KpiDeltas = {
  events: number;
  eventsPrev: number;
  strikes: number;
  strikesPrev: number;
  verifiedPct: number;
  verifiedPrevPct: number;
  activeSectors: number;
  activeSectorsPrev: number;
};

export async function getKpiDeltas(
  theater: TheaterKey = "ukraine",
  timeRange: TimeRange = "24h",
): Promise<KpiDeltas> {
  timeRange = await clampedRange(timeRange);
  const empty: KpiDeltas = {
    events: 0, eventsPrev: 0, strikes: 0, strikesPrev: 0, verifiedPct: 0, verifiedPrevPct: 0, activeSectors: 0, activeSectorsPrev: 0,
  };
  if (!isDatabaseConfigured()) return empty;

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = {
      events: number; events_prev: number;
      strikes: number; strikes_prev: number;
      verified_pct: number; verified_prev_pct: number;
      active_sectors: number; active_sectors_prev: number;
    };

    const row = await queryOne<Row>(
      `
      WITH curr AS (
        SELECT
          count(*)::int AS events,
          count(*) FILTER (WHERE event_type = 'strike')::int AS strikes,
          COALESCE(round(
            100.0 * count(*) FILTER (WHERE confidence = 'verified')::numeric / NULLIF(count(*), 0)
          ), 0)::int AS verified_pct,
          count(DISTINCT oblast) FILTER (
            WHERE oblast IS NOT NULL AND btrim(oblast) <> ''
              AND lower(btrim(oblast)) NOT IN ('unknown', '<unknown>', 'n/a', 'multiple')
          )::int AS active_sectors
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at > now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
      ),
      prev AS (
        SELECT
          count(*)::int AS events,
          count(*) FILTER (WHERE event_type = 'strike')::int AS strikes,
          COALESCE(round(
            100.0 * count(*) FILTER (WHERE confidence = 'verified')::numeric / NULLIF(count(*), 0)
          ), 0)::int AS verified_pct,
          count(DISTINCT oblast) FILTER (
            WHERE oblast IS NOT NULL AND btrim(oblast) <> ''
              AND lower(btrim(oblast)) NOT IN ('unknown', '<unknown>', 'n/a', 'multiple')
          )::int AS active_sectors
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at BETWEEN now() - INTERVAL '${interval}' * 2 AND now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
      )
      SELECT
        curr.events, prev.events AS events_prev,
        curr.strikes, prev.strikes AS strikes_prev,
        curr.verified_pct, prev.verified_pct AS verified_prev_pct,
        curr.active_sectors, prev.active_sectors AS active_sectors_prev
      FROM curr, prev
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    if (!row) return empty;

    return {
      events: Number(row.events) || 0,
      eventsPrev: Number(row.events_prev) || 0,
      strikes: Number(row.strikes) || 0,
      strikesPrev: Number(row.strikes_prev) || 0,
      verifiedPct: Number(row.verified_pct) || 0,
      verifiedPrevPct: Number(row.verified_prev_pct) || 0,
      activeSectors: Number(row.active_sectors) || 0,
      activeSectorsPrev: Number(row.active_sectors_prev) || 0,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Fusion rate — share of window events corroborated by 2+ distinct sources
// ---------------------------------------------------------------------------

export type FusionCounts = { total: number; multiSource: number };

// Raw fusion counts for a theater/window: total published events in the bbox and
// how many have >= 2 distinct sources. Exposed so /admin/tieout can tie out at the
// count level (rounding-immune) rather than comparing pre-rounded percentages.
export async function getFusionCounts(
  theater: TieoutTheater = "ukraine",
  timeRange: TimeRange | "all" = "24h",
): Promise<FusionCounts | null> {
  timeRange = await clampedWindow(timeRange);
  if (!isDatabaseConfigured()) return null;

  const pred = theaterPredicate(theater);

  try {
    const row = await queryOne<{ total: string | number; fused: string | number }>(
      `
      WITH we AS (
        SELECT DISTINCT e.id
        FROM events e
        WHERE e.published_at IS NOT NULL
          ${occurredAtClause(timeRange)}
          AND ${pred.sql}
      ),
      sc AS (
        SELECT we.id, count(DISTINCT es.source_id) AS sources
        FROM we
        LEFT JOIN event_sources es ON es.event_id = we.id
        GROUP BY we.id
      )
      SELECT
        count(*)::int                             AS total,
        count(*) FILTER (WHERE sources >= 2)::int AS fused
      FROM sc
      `,
      pred.params,
    );

    if (!row) return null;
    return { total: Number(row.total) || 0, multiSource: Number(row.fused) || 0 };
  } catch {
    return null;
  }
}

export async function getFusionRate(
  theater: TieoutTheater = "ukraine",
  timeRange: TimeRange | "all" = "24h",
): Promise<number | null> {
  const counts = await getFusionCounts(theater, timeRange);
  if (!counts || counts.total === 0) return null;   // no events → render "—", not "0%"
  return Math.round((counts.multiSource / counts.total) * 100);
}

// ---------------------------------------------------------------------------
// Tie-out rows — every window event with its distinct source count, for the
// /admin/tieout audit page + export. Uses the same filter + join as
// getFusionCounts so the Fusion KPI ties out by construction.
// ---------------------------------------------------------------------------

export type TieoutRow = {
  event_id: string;
  occurred_at: string;       // ISO 8601 UTC
  event_type: string;
  theater: string;           // selected theater; bbox-derived per row under "all"
  location_name: string | null;
  lat: number;
  lon: number;
  source_count: number;      // distinct source_id
  confidence: string;        // verified | partial | unconfirmed
  platforms: string[];       // distinct platforms across the linked sources
};

export async function getTieoutRows(
  theater: TieoutTheater = "ukraine",
  window: TieoutWindow = "24h",
): Promise<TieoutRow[]> {
  window = await clampedWindow(window);
  if (!isDatabaseConfigured()) return [];

  const pred = theaterPredicate(theater);

  try {
    type Row = {
      event_id: string;
      occurred_at: Date;
      event_type: EventType;
      bbox_theater: string | null;
      location_name: string | null;
      lat: number;
      lon: number;
      source_count: string | number;
      confidence: Confidence;
      platforms: string[];
    };

    const rows = await query<Row>(
      `
      SELECT
        e.id::text                        AS event_id,
        e.occurred_at                     AS occurred_at,
        e.event_type                      AS event_type,
        ${theaterLabelCase("e.location")} AS bbox_theater,
        e.location_name                   AS location_name,
        ST_Y(e.location)::float8          AS lat,
        ST_X(e.location)::float8          AS lon,
        COUNT(DISTINCT es.source_id)::int AS source_count,
        e.confidence                      AS confidence,
        COALESCE(array_agg(DISTINCT s.platform) FILTER (WHERE s.platform IS NOT NULL), '{}') AS platforms
      FROM events e
      LEFT JOIN event_sources es ON es.event_id = e.id
      LEFT JOIN sources s ON s.id = es.source_id
      WHERE e.published_at IS NOT NULL
        ${occurredAtClause(window)}
        AND ${pred.sql}
      GROUP BY e.id
      ORDER BY source_count DESC, e.occurred_at DESC
      `,
      pred.params,
    );

    return rows.map((r) => ({
      event_id: r.event_id,
      occurred_at: new Date(r.occurred_at).toISOString(),
      event_type: r.event_type,
      // A single-theater selection scopes every row to that theater by
      // construction; only Global needs the per-row bbox label.
      theater: theater === "all" ? (r.bbox_theater ?? "all") : theater,
      location_name: r.location_name,
      lat: r.lat,
      lon: r.lon,
      source_count: Number(r.source_count) || 0,
      confidence: r.confidence,
      platforms: r.platforms,
    }));
  } catch {
    return [];
  }
}

// Method B: derive the fusion totals from the visible tie-out rows. Rounds the
// same way getFusionRate does (JS Math.round over integer counts), so Method A
// and Method B agree whenever their underlying counts agree.
export function tieoutSummary(rows: TieoutRow[]): {
  total: number;
  multiSource: number;
  fusionPct: number | null;
} {
  const total = rows.length;
  const multiSource = rows.filter((r) => r.source_count >= 2).length;
  return {
    total,
    multiSource,
    fusionPct: total === 0 ? null : Math.round((multiSource / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Median TTV — median(published_at − primary source's posted_at), in minutes
// ---------------------------------------------------------------------------

export async function getMedianTTV(
  theater: TheaterKey = "ukraine",
  timeRange: TimeRange = "24h",
): Promise<number | null> {
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return null;

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    const row = await queryOne<{ median_minutes: string | number | null }>(
      `
      WITH we AS (
        SELECT e.id, e.published_at
        FROM events e
        WHERE e.published_at IS NOT NULL
          AND e.occurred_at > now() - INTERVAL '${interval}'
          AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("e.location", theater)}
      ),
      prim AS (
        -- One row per event: time from the (earliest) primary source post to
        -- publication. Events without a primary source row are skipped.
        SELECT we.published_at - min(rp.posted_at) AS ttv
        FROM we
        JOIN event_sources es ON es.event_id = we.id AND es.relationship = 'primary'
        JOIN raw_posts rp     ON rp.id = es.raw_post_id
        GROUP BY we.id, we.published_at
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM ttv) / 60.0
             ) AS median_minutes
      FROM prim
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    if (row?.median_minutes == null) return null;
    return Math.round(Number(row.median_minutes));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sensor strip — source-activity pulse for the selected theater
// ---------------------------------------------------------------------------
//
// Scoping: raw_posts carry no location, so a platform pill counts posts from
// active sources assigned to the selected theater (theater = ANY sources.theaters)
// within PILL_WINDOW_MINUTES. This counts feed volume regardless of whether a
// post became an event (e.g. GDELT is ~100% LLM-skipped yet is still a live
// feed). LAT reports the age of the most recent such post; TRK counts distinct
// event actors in the theater bbox over the last 24h.

export async function getSensorStripData(theater: TheaterKey = "ukraine"): Promise<SensorStripData> {
  const empty: SensorStripData = {
    platforms: { tg: 0, x: 0, rss: 0, gdelt: 0, bsky: 0 },
    latency_seconds: null,
    tracks: 0,
  };
  if (!isDatabaseConfigured()) return empty;

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];

  try {
    type Row = {
      tg: number; x: number; rss: number; gdelt: number; bsky: number;
      latency_seconds: number | null;
      tracks: number;
    };

    const row = await queryOne<Row>(
      `
      WITH recent AS (
        SELECT rp.posted_at, s.platform
        FROM raw_posts rp
        JOIN sources s ON s.id = rp.source_id
        WHERE s.is_active
          AND $1 = ANY(s.theaters)
          AND rp.posted_at > now() - ($2::int * INTERVAL '1 minute')
      )
      SELECT
        count(*) FILTER (WHERE platform = 'telegram')::int AS tg,
        count(*) FILTER (WHERE platform = 'x')::int        AS x,
        count(*) FILTER (WHERE platform = 'rss')::int      AS rss,
        count(*) FILTER (WHERE platform = 'gdelt')::int    AS gdelt,
        count(*) FILTER (WHERE platform = 'bluesky')::int  AS bsky,
        round(EXTRACT(EPOCH FROM (now() - max(posted_at))))::int AS latency_seconds,
        (SELECT count(DISTINCT actor)::int FROM events
           WHERE published_at IS NOT NULL
             AND occurred_at > now() - INTERVAL '24 hours'
             AND actor IS NOT NULL
             AND ST_Within(location, ST_MakeEnvelope($3, $4, $5, $6, 4326))${israelCarveOut("location", theater)}) AS tracks
      FROM recent
      `,
      [theater, PILL_WINDOW_MINUTES, minLng, minLat, maxLng, maxLat],
    );

    if (!row) return empty;

    return {
      platforms: {
        tg: Number(row.tg) || 0,
        x: Number(row.x) || 0,
        rss: Number(row.rss) || 0,
        gdelt: Number(row.gdelt) || 0,
        bsky: Number(row.bsky) || 0,
      },
      latency_seconds: row.latency_seconds == null ? null : Number(row.latency_seconds),
      tracks: Number(row.tracks) || 0,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Map events (last 24h)
// ---------------------------------------------------------------------------

export async function getMapEvents(theater: TheaterKey = "ukraine", timeRange: TimeRange = "24h"): Promise<MapEvent[]> {
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return [];

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
        AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("e.location", theater)}
      GROUP BY e.id
      ORDER BY e.occurred_at DESC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return [];

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
    return [];
  }
}

// ---------------------------------------------------------------------------
// Alerts (latest 3)
// ---------------------------------------------------------------------------

export async function getAlerts(theater: TheaterKey = "ukraine", limit: number | null = 3, timeRange: TimeRange = "24h"): Promise<Alert[]> {
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return [];

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
        AND ST_Within(e.location, ST_MakeEnvelope($2, $3, $4, $5, 4326))${israelCarveOut("e.location", theater)}
      GROUP BY e.id
      ORDER BY e.occurred_at DESC
      LIMIT $1::bigint
      `,
      [limit, minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return [];

    return rows.map((r) => ({
      id: r.id,
      event_type: r.event_type,
      title: r.title,
      confidence: r.confidence,
      source_count: Number(r.source_count) || 0,
      minutes_ago: minutesAgo(r.occurred_at),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Intensity (last 7 days)
// ---------------------------------------------------------------------------

export async function getIntensity(theater: TheaterKey = "ukraine"): Promise<IntensityDay[]> {
  if (!isDatabaseConfigured()) return [];

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
       AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("e.location", theater)}
      GROUP BY d.day
      ORDER BY d.day ASC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    const counts = rows.map((r) => Number(r.count) || 0);

    if (counts.every((c) => c === 0)) return [];

    const max = Math.max(1, ...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

    return rows.map((r, i) => ({
      label: dayLabel(new Date(r.day)),
      value: Math.round((counts[i] / max) * 100),
      hot: counts[i] > avg * 1.25,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sector threat (oblast breakdown, current window vs. the prior window)
// ---------------------------------------------------------------------------

export async function getSectors(theater: TheaterKey = "ukraine", timeRange: TimeRange = "24h", limit = 6): Promise<Sector[]> {
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return [];

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = {
      name: string;
      events: string | number;
      strikes: string | number;
      prev: string | number;
    };

    const rows = await query<Row>(
      `
      WITH curr AS (
        SELECT
          oblast                                        AS name,
          count(*)                                      AS events,
          count(*) FILTER (WHERE event_type = 'strike') AS strikes
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at > now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
          AND oblast IS NOT NULL
          AND btrim(oblast) <> ''
          AND lower(btrim(oblast)) NOT IN ('unknown', '<unknown>', 'n/a', 'multiple')
        GROUP BY oblast
      ),
      prev AS (
        SELECT oblast AS name, count(*) AS events
        FROM events
        WHERE published_at IS NOT NULL
          AND occurred_at BETWEEN now() - INTERVAL '${interval}' * 2 AND now() - INTERVAL '${interval}'
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
          AND oblast IS NOT NULL
        GROUP BY oblast
      )
      SELECT
        c.name                      AS name,
        c.events::int               AS events,
        c.strikes::int              AS strikes,
        COALESCE(p.events, 0)::int  AS prev
      FROM curr c
      LEFT JOIN prev p ON p.name = c.name
      ORDER BY c.events DESC, c.strikes DESC
      LIMIT $5
      `,
      [minLng, minLat, maxLng, maxLat, limit],
    );

    if (!rows.length) return [];

    const counts = rows.map((r) => Number(r.events) || 0);
    const max = Math.max(1, ...counts);

    return rows.map((r) => {
      const events = Number(r.events) || 0;
      const strikes = Number(r.strikes) || 0;
      const prev = Number(r.prev) || 0;
      const pct = Math.round((events / max) * 100);
      const level =
        pct > 80 ? "Critical" : pct > 50 ? "Elevated" : pct > 25 ? "Moderate" : "Reduced";
      const delta = prev > 0 ? Math.round(((events - prev) / prev) * 100) : null;
      const trend = delta === null ? "NEW" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}%`;
      return { name: r.name, level, trend, pct, events, strikes };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Threat axes (weapon_type breakdown for the selected theater — peer of Sectors)
// ---------------------------------------------------------------------------
//
// Same theater/window/published scoping as getSectors so the AXES toggle is a
// true peer of SECTORS. Theater resolution reuses THEATER_BBOX + ST_Within (no
// parallel path). Only classified events (weapon_type IS NOT NULL) are counted;
// GROUP BY returns present classes only, so empty axes never render.
export async function getThreatAxes(theater: TheaterKey = "ukraine", timeRange: TimeRange = "24h"): Promise<ThreatAxes> {
  timeRange = await clampedRange(timeRange);
  if (!isDatabaseConfigured()) return { rows: [], total: 0 };

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];
  const interval = SQL_INTERVALS[timeRange];

  try {
    type Row = { weapon_type: WeaponType; n: string | number };

    const rows = await query<Row>(
      `
      SELECT weapon_type, COUNT(*)::int AS n
      FROM events
      WHERE published_at IS NOT NULL
        AND occurred_at > now() - INTERVAL '${interval}'
        AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("location", theater)}
        AND weapon_type IS NOT NULL
      GROUP BY weapon_type
      ORDER BY n DESC
      `,
      [minLng, minLat, maxLng, maxLat],
    );

    const out = rows.map((r) => ({ weapon_type: r.weapon_type, n: Number(r.n) || 0 }));
    const total = out.reduce((sum, r) => sum + r.n, 0);
    return { rows: out, total };
  } catch {
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Top sources (dashboard panel — top 5 by today's events)
// ---------------------------------------------------------------------------

export async function getTopSources(theater: TheaterKey = "ukraine", limit = 5): Promise<Source[]> {
  if (!isDatabaseConfigured()) return [];

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
          AND ST_Within(e.location, ST_MakeEnvelope($2, $3, $4, $5, 4326))${israelCarveOut("e.location", theater)}
        GROUP BY es.source_id
      ) today ON today.source_id = s.id
      WHERE s.is_active = true
        AND s.id IN (
          SELECT DISTINCT es2.source_id
          FROM event_sources es2
          JOIN events e2 ON e2.id = es2.event_id
          WHERE e2.published_at IS NOT NULL
            AND e2.occurred_at > now() - INTERVAL '30 days'
            AND ST_Within(e2.location, ST_MakeEnvelope($2, $3, $4, $5, 4326))${israelCarveOut("e2.location", theater)}
        )
      ORDER BY events_count DESC, verified_rate DESC
      LIMIT $1
      `,
      [limit, minLng, minLat, maxLng, maxLat],
    );

    if (!rows.length) return [];

    return rows.map((r, i) => ({
      rank: i + 1,
      handle: r.handle,
      display_name: r.display_name,
      platform: r.platform,
      events_count: Number(r.events_count) || 0,
      verified_rate: Number(r.verified_rate) || 0,
    }));
  } catch {
    return [];
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
    // W2-3: BLUF briefings preview as the BLUF body (headings stripped);
    // legacy rows keep the first-two-paragraphs preview unchanged.
    paragraphs: briefingPreviewParagraphs(text),
  };
}

export async function getLatestBriefing(theater: TheaterKey = "ukraine"): Promise<BriefingData | null> {
  if (!isDatabaseConfigured()) return null;

  // Briefing floor: watch sees the last 24h of briefings only. When the latest
  // briefing is older than the floor, watch gets the honest empty state.
  const { briefing: floor } = await requestFloors();

  try {
    const row = await queryOne<BriefingRow>(
      `
      SELECT id::text, draft_text, published_text, status, event_ids::text[], published_at, created_at
      FROM briefings
      WHERE theater = $1
        AND ($2::timestamptz IS NULL OR COALESCE(published_at, created_at) >= $2::timestamptz)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [theater, floor],
    );

    if (!row) return null;

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
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source Feed — raw posts joined to sources, chronological
// ---------------------------------------------------------------------------

export interface FeedPost {
  id:               string;
  posted_at:        string;       // ISO
  minutes_ago:      number;
  text:             string;
  translated_text:  string | null;
  lang:             string | null;
  source_handle:    string;
  source_display:   string;
  source_platform:  Platform;
  source_url:       string | null;
  source_trust:     1 | 2 | 3;
}

export interface FeedPage {
  posts:       FeedPost[];
  next_before: string | null;     // ISO timestamp to pass back as `before`
  /** True when the viewer's tier time floor bounded this page (watch: 7 days). */
  clamped:     boolean;
}

const FEED_PAGE_SIZE = 30;

export interface FeedFilters {
  before?:    string;             // pagination cursor (ISO timestamp)
  platforms?: Platform[];         // empty / undefined = all
  tiers?:     Array<1 | 2 | 3>;   // empty / undefined = all
}

export async function getSourceFeedPosts(
  theater: TheaterKey = "ukraine",
  opts: FeedFilters = {},
): Promise<FeedPage> {
  if (!isDatabaseConfigured()) return { posts: [], next_before: null, clamped: false };

  // Post floor: watch never paginates past 7 days of posts (posted_at).
  const { event: floor } = await requestFloors();

  const [minLng, minLat, maxLng, maxLat] = THEATER_BBOX[theater];

  type Row = {
    id:               string;
    posted_at:        Date;
    text:             string;
    translated_text:  string | null;
    lang:             string | null;
    source_handle:    string;
    source_display:   string;
    source_platform:  Platform;
    source_url:       string | null;
    source_trust:     number;
  };

  // We join to event_sources → events to scope posts to the theater bbox.
  // Posts that haven't been linked to an event yet won't appear here; that's
  // intentional for v1 — those are the noisy long tail.
  const before    = opts.before ?? null;
  const platforms = opts.platforms && opts.platforms.length > 0 ? opts.platforms : null;
  const tiers     = opts.tiers     && opts.tiers.length     > 0 ? opts.tiers     : null;
  try {
    const rows = await query<Row>(
      `
      SELECT DISTINCT ON (rp.posted_at, rp.id)
        rp.id::text            AS id,
        rp.posted_at           AS posted_at,
        rp.text                AS text,
        rp.translated_text     AS translated_text,
        rp.lang                AS lang,
        s.handle               AS source_handle,
        s.display_name         AS source_display,
        s.platform             AS source_platform,
        s.url                  AS source_url,
        s.trust_tier           AS source_trust
      FROM raw_posts rp
      JOIN sources s        ON s.id = rp.source_id
      JOIN event_sources es ON es.raw_post_id = rp.id
      JOIN events e         ON e.id = es.event_id
      WHERE e.published_at IS NOT NULL
        AND ST_Within(e.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))${israelCarveOut("e.location", theater)}
        AND ($5::timestamptz IS NULL OR rp.posted_at < $5::timestamptz)
        AND ($6::text[]      IS NULL OR s.platform   = ANY($6::text[]))
        AND ($7::smallint[]  IS NULL OR s.trust_tier = ANY($7::smallint[]))
        AND ($8::timestamptz IS NULL OR rp.posted_at >= $8::timestamptz)
      ORDER BY rp.posted_at DESC, rp.id DESC
      LIMIT ${FEED_PAGE_SIZE + 1}
      `,
      [minLng, minLat, maxLng, maxLat, before, platforms, tiers, floor],
    );

    const hasMore = rows.length > FEED_PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;

    const posts: FeedPost[] = pageRows.map((r) => ({
      id:              r.id,
      posted_at:       r.posted_at.toISOString(),
      minutes_ago:     minutesAgo(r.posted_at),
      text:            r.text,
      translated_text: r.translated_text,
      lang:            r.lang,
      source_handle:   r.source_handle,
      source_display:  r.source_display,
      source_platform: r.source_platform,
      source_url:      r.source_url,
      source_trust:    (r.source_trust as 1 | 2 | 3) ?? 2,
    }));

    const last = pageRows[pageRows.length - 1];
    return {
      posts,
      next_before: hasMore && last ? last.posted_at.toISOString() : null,
      clamped: floor !== null,
    };
  } catch {
    return { posts: [], next_before: null, clamped: floor !== null };
  }
}

// ---------------------------------------------------------------------------
// Source Feed — full firehose (every ingested post for a theater)
// ---------------------------------------------------------------------------
//
// Unlike getSourceFeedPosts, this is NOT scoped to published events: it returns
// every raw post for the theater's sources, including unprocessed and skipped
// ones. Scoping is by sources.theater, since raw posts carry no location.

export async function getFirehosePosts(
  theater: TheaterKey = "ukraine",
  opts: FeedFilters = {},
): Promise<FeedPage> {
  if (!isDatabaseConfigured()) return { posts: [], next_before: null, clamped: false };

  // Post floor: same clamp as getSourceFeedPosts (watch: 7 days of posted_at).
  const { event: floor } = await requestFloors();

  type Row = {
    id:               string;
    posted_at:        Date;
    text:             string;
    translated_text:  string | null;
    lang:             string | null;
    source_handle:    string;
    source_display:   string;
    source_platform:  Platform;
    source_url:       string | null;
    source_trust:     number;
  };

  const before    = opts.before ?? null;
  const platforms = opts.platforms && opts.platforms.length > 0 ? opts.platforms : null;
  const tiers     = opts.tiers     && opts.tiers.length     > 0 ? opts.tiers     : null;
  try {
    const rows = await query<Row>(
      `
      SELECT
        rp.id::text            AS id,
        rp.posted_at           AS posted_at,
        rp.text                AS text,
        rp.translated_text     AS translated_text,
        rp.lang                AS lang,
        s.handle               AS source_handle,
        s.display_name         AS source_display,
        s.platform             AS source_platform,
        s.url                  AS source_url,
        s.trust_tier           AS source_trust
      FROM raw_posts rp
      JOIN sources s ON s.id = rp.source_id
      WHERE s.theater = $1
        AND ($2::timestamptz IS NULL OR rp.posted_at < $2::timestamptz)
        AND ($3::text[]      IS NULL OR s.platform   = ANY($3::text[]))
        AND ($4::smallint[]  IS NULL OR s.trust_tier = ANY($4::smallint[]))
        AND ($5::timestamptz IS NULL OR rp.posted_at >= $5::timestamptz)
      ORDER BY rp.posted_at DESC, rp.id DESC
      LIMIT ${FEED_PAGE_SIZE + 1}
      `,
      [theater, before, platforms, tiers, floor],
    );

    const hasMore = rows.length > FEED_PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;

    const posts: FeedPost[] = pageRows.map((r) => ({
      id:              r.id,
      posted_at:       r.posted_at.toISOString(),
      minutes_ago:     minutesAgo(r.posted_at),
      text:            r.text,
      translated_text: r.translated_text,
      lang:            r.lang,
      source_handle:   r.source_handle,
      source_display:  r.source_display,
      source_platform: r.source_platform,
      source_url:      r.source_url,
      source_trust:    (r.source_trust as 1 | 2 | 3) ?? 2,
    }));

    const last = pageRows[pageRows.length - 1];
    return {
      posts,
      next_before: hasMore && last ? last.posted_at.toISOString() : null,
      clamped: floor !== null,
    };
  } catch {
    return { posts: [], next_before: null, clamped: floor !== null };
  }
}

// ---------------------------------------------------------------------------
// Watches — per-user watched raw posts + confirmation status
// ---------------------------------------------------------------------------
//
// A post is "confirmed" once Sentinel View links it to a published, geocoded
// event (via event_sources → events). That event's id lets the UI deep-link to
// /event/[id]. Confirmation is global; watching is per-user.

export interface WatchInfo {
  confirmed: boolean;
  event_id:  string | null;
}

// Returns watch info keyed by raw_post_id for the subset of rawPostIds the user
// is watching. Posts absent from the result are simply not watched.
export async function getWatchInfo(
  clerkUserId: string,
  rawPostIds: string[],
): Promise<Record<string, WatchInfo>> {
  if (!isDatabaseConfigured() || rawPostIds.length === 0) return {};

  try {
    type Row = { raw_post_id: string; confirmed: boolean; event_id: string | null };
    const rows = await query<Row>(
      `
      SELECT
        w.raw_post_id::text AS raw_post_id,
        (ev.id IS NOT NULL) AS confirmed,
        ev.id::text         AS event_id
      FROM watches w
      LEFT JOIN LATERAL (
        SELECT e.id
        FROM event_sources es
        JOIN events e ON e.id = es.event_id
        WHERE es.raw_post_id = w.raw_post_id
          AND e.published_at IS NOT NULL
        ORDER BY e.published_at DESC
        LIMIT 1
      ) ev ON true
      WHERE w.clerk_user_id = $1
        AND w.raw_post_id = ANY($2::uuid[])
      `,
      [clerkUserId, rawPostIds],
    );

    const out: Record<string, WatchInfo> = {};
    for (const r of rows) {
      out[r.raw_post_id] = { confirmed: r.confirmed, event_id: r.event_id };
    }
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Event detail
// ---------------------------------------------------------------------------

// Detail reads return a discriminated result so pages MUST handle the gated
// state explicitly (upgrade prompt, never a 404 and never leaked data). The
// "gated" variant carries no record fields — nothing enters the RSC payload.
export type GatedResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "gated" }
  | { kind: "missing" };

export async function getEventDetail(id: string): Promise<GatedResult<EventDetail>> {
  if (!isDatabaseConfigured()) return { kind: "missing" };

  const { event: floor } = await requestFloors();

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

    if (!evt) return { kind: "missing" };
    // Gate BEFORE fetching sources/excerpts: a gated event loads nothing else.
    if (isGatedByFloor(evt.occurred_at, floor)) return { kind: "gated" };

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

    return { kind: "ok", data: {
      id: evt.id,
      event_type: evt.event_type,
      occurred_at: new Date(evt.occurred_at).toISOString(),
      lng: Number(evt.lng),
      lat: Number(evt.lat),
      location_name: evt.location_name,
      oblast: evt.oblast,
      description: evt.description,
      confidence: evt.confidence,
      source_count: Number(evt.source_count),
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
    } };
  } catch {
    return { kind: "missing" };
  }
}

// ---------------------------------------------------------------------------
// Full briefing
// ---------------------------------------------------------------------------

export async function getFullBriefing(id: string): Promise<GatedResult<FullBriefing>> {
  if (!isDatabaseConfigured()) return { kind: "missing" };

  const { briefing: floor } = await requestFloors();

  try {
    const row = await queryOne<BriefingRow>(
      `
      SELECT id::text, draft_text, published_text, status, event_ids::text[], published_at, created_at
      FROM briefings
      WHERE id = $1::uuid
      `,
      [id],
    );

    if (!row) return { kind: "missing" };
    // Gate BEFORE deriving text or fetching summaries: nothing else loads.
    if (isGatedByFloor(row.published_at ?? row.created_at, floor)) return { kind: "gated" };

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

    return { kind: "ok", data: {
      id: row.id,
      date: fmtBriefingDate(new Date(ts)),
      utc_time: fmtBriefingUTC(new Date(ts)),
      source_count: Number(sourceCountRow?.count) || 0,
      reviewed: row.status === "published",
      // W2-3 preview rule (BLUF body when present), as in rowToBriefing.
      paragraphs: briefingPreviewParagraphs(text),
      full_paragraphs: fullParagraphs,
      // Parsed BLUF sections; null keeps legacy rows on today's renderer.
      sections: parseBriefingSections(text),
      referenced_event_ids: row.event_ids,
      confidence_summary,
    } };
  } catch {
    return { kind: "missing" };
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
  if (!isDatabaseConfigured()) return [];

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
        COALESCE(today.cnt, 0)::int             AS events_today
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
      events_30d: Number(r.events_30d) || 0,
      last_event_at: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
      trust_tier: (r.trust_tier as 1 | 2 | 3) ?? 2,
      notes: r.notes ?? "",
    }));
  } catch {
    return [];
  }
}
