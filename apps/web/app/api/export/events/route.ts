// Customer exports (W2-2): the dashboard's CSV/JSON download lane.
// Clerk-session auth (NOT bearer keys — that lane is /api/v1), live
// entitlement re-derivation via the shared W2-1 helper, metered against
// export_log only. The /api middleware already 401s anonymous requests.
import { auth } from "@clerk/nextjs/server";
import { query, queryOne } from "@/lib/db";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { THEATER_CASE_SQL, API_THEATERS } from "@/lib/api-v1";
import { utcMidnightResetEpoch } from "@/lib/api-v1-core";
import {
  EXPORT_LIMIT_MESSAGE,
  EXPORT_ROW_CAP,
  buildCsv,
  buildExportFilename,
  buildExportMeta,
  exportAllowance,
  resolveExportRange,
  type ExportEventRow,
} from "@/lib/exports-core";

export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: message, code }, { status });
}

// Rows logged for this user in the current UTC day — the daily meter. Both
// sides of the comparison use the DB clock (created_at defaults to now()), so
// the counter resets exactly at 00:00 UTC regardless of session timezone.
const TODAY_UTC_SQL = `created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return jsonError(401, "unauthorized", "Sign in to export.");

  // Tier is never trusted from the client: re-derive on every request
  // (grants > subscription > watch — the shared lib). Watch (and anonymous)
  // never see the export control, but UI hiding is not security.
  const ent = await getEntitlementsForUser(userId);
  if (!ent.canExport) {
    return jsonError(
      403,
      "tier_insufficient",
      "Exports require an active Analyst subscription. Manage your plan at https://dashboard.thesentinelreview.com/pricing",
    );
  }

  const p = new URL(req.url).searchParams;
  const theater = p.get("theater");
  if (!theater || !(API_THEATERS as readonly string[]).includes(theater)) {
    return jsonError(422, "invalid_parameter", `theater must be one of ${API_THEATERS.join(", ")}`);
  }
  const format = p.get("format");
  if (format !== "csv" && format !== "json") {
    return jsonError(422, "invalid_parameter", "format must be csv or json");
  }
  const range = resolveExportRange(p.get("window"), p.get("start"), p.get("end"));
  if ("code" in range) return jsonError(422, range.code, range.message);

  // Daily meter — COUNT(*) of today's export_log rows. Exports are metered
  // here and ONLY here: api_usage (the API call quota) is never touched.
  // Check-then-log has a small read-committed race under concurrent requests;
  // acceptable for an anti-abuse cap (the log row, not the cap, is the audit
  // record). Fail-closed: if export_log is missing (deploy ahead of the 0035
  // migrate tick) or unreadable, no unmetered, unlogged file ever ships.
  let countToday: number;
  try {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM export_log WHERE user_id = $1 AND ${TODAY_UTC_SQL}`,
      [userId],
    );
    countToday = row?.n ?? 0;
  } catch {
    return jsonError(503, "export_unavailable", "Exports are initializing — try again in a few minutes.");
  }
  const meter = exportAllowance(countToday, ent.tier);
  const meterHeaders = {
    "X-Export-Limit": String(meter.limit),
    "X-Export-Remaining": String(meter.remaining),
    "X-Export-Reset": String(utcMidnightResetEpoch()),
  };
  if (!meter.allowed) {
    return Response.json(
      { error: EXPORT_LIMIT_MESSAGE, code: "export_limit_reached" },
      { status: 429, headers: meterHeaders },
    );
  }

  // The 10 tie-out columns + summary (events.description — the text rendered
  // on event cards; same value the Read API exposes as `summary`). Theater is
  // bbox-derived via the shared THEATER_CASE_SQL — the W2-1 API derivation,
  // not a parallel implementation. No raw post text, no source URLs.
  type Row = {
    event_id: string; occurred_at: Date; event_type: string; theater: string;
    location_name: string | null; lat: number; lon: number;
    source_count: number; confidence: string; platforms: string[]; summary: string;
  };
  const rows = await query<Row>(
    `SELECT e.id::text AS event_id, e.occurred_at, e.event_type,
            ${THEATER_CASE_SQL} AS theater,
            e.location_name,
            ST_Y(e.location)::float8 AS lat, ST_X(e.location)::float8 AS lon,
            COUNT(DISTINCT es.source_id)::int AS source_count,
            e.confidence,
            COALESCE(array_agg(DISTINCT s.platform) FILTER (WHERE s.platform IS NOT NULL), '{}') AS platforms,
            e.description AS summary
     FROM events e
     LEFT JOIN event_sources es ON es.event_id = e.id
     LEFT JOIN sources s        ON s.id = es.source_id
     WHERE e.published_at IS NOT NULL
       AND e.occurred_at >= $1
       AND e.occurred_at <= $2
       AND ${THEATER_CASE_SQL} = $3
     GROUP BY e.id
     ORDER BY e.occurred_at DESC, e.id::text DESC
     LIMIT $4::int`,
    [range.start, range.end, theater, EXPORT_ROW_CAP + 1],
  );

  const truncated = rows.length > EXPORT_ROW_CAP;
  const events: ExportEventRow[] = rows.slice(0, EXPORT_ROW_CAP).map((r) => ({
    event_id: r.event_id,
    occurred_at: new Date(r.occurred_at).toISOString(),
    event_type: r.event_type,
    theater: r.theater,
    location_name: r.location_name,
    lat: r.lat,
    lon: r.lon,
    source_count: Number(r.source_count) || 0,
    confidence: r.confidence,
    platforms: r.platforms,
    summary: r.summary,
  }));

  // Audit-first: the log row is written before the file ships. If logging
  // fails, no file — an export that isn't on the record doesn't happen.
  try {
    await query(
      `INSERT INTO export_log
         (user_id, tier, theater_scope, window_start, window_end, format, row_count, truncated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, ent.tier, theater, range.start, range.end, format, events.length, truncated],
    );
  } catch {
    return jsonError(503, "export_unavailable", "Exports are initializing — try again in a few minutes.");
  }

  const now = new Date();
  const filename = buildExportFilename(theater, range.slug, format, now);
  const meta = buildExportMeta({
    window: range.window,
    theater,
    rowCount: events.length,
    truncated,
    now,
  });

  if (format === "json") {
    return new Response(JSON.stringify({ _meta: meta, events }, null, 2), {
      headers: {
        ...meterHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  return new Response(buildCsv(events, truncated), {
    headers: {
      ...meterHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
