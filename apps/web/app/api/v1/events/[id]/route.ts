import { query, queryOne } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk, THEATER_CASE_SQL } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(422, "invalid_parameter", "id must be a UUID", auth.rate);

  type Row = {
    id: string; occurred_at: Date; event_type: string; theater: string;
    lat: number; lon: number; confidence: string; title: string; summary: string;
    source_count: number;
  };
  const evt = await queryOne<Row>(
    `SELECT e.id::text AS id, e.occurred_at, e.event_type,
            ${THEATER_CASE_SQL} AS theater,
            ST_Y(e.location)::float8 AS lat, ST_X(e.location)::float8 AS lon,
            e.confidence,
            CASE WHEN char_length(e.description) <= 80 THEN e.description
                 ELSE initcap(e.event_type) || ' — ' || e.location_name END AS title,
            e.description AS summary,
            COUNT(DISTINCT es.source_id)::int AS source_count
     FROM events e
     LEFT JOIN event_sources es ON es.event_id = e.id
     WHERE e.id = $1::uuid AND e.published_at IS NOT NULL
     GROUP BY e.id`,
    [id],
  );
  if (!evt) return jsonError(404, "not_found", "No published event with that id.", auth.rate);

  // Same source data an Analyst sees in the UI event detail.
  const sources = await query<{ platform: string; posted_at: Date | null; url: string | null }>(
    `SELECT s.platform, rp.posted_at, s.url
     FROM event_sources es
     JOIN sources s ON s.id = es.source_id
     LEFT JOIN raw_posts rp ON rp.id = es.raw_post_id
     WHERE es.event_id = $1::uuid
     ORDER BY rp.posted_at ASC NULLS LAST`,
    [id],
  );

  return jsonOk(
    {
      ...evt,
      occurred_at: new Date(evt.occurred_at).toISOString(),
      verified: evt.confidence === "verified",
      sources: sources.map((s) => ({
        platform: s.platform,
        posted_at: s.posted_at ? new Date(s.posted_at).toISOString() : null,
        url: s.url,
      })),
    },
    auth.rate,
  );
}
