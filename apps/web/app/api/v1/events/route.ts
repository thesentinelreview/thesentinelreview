import { query } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk, THEATER_CASE_SQL, API_THEATERS } from "@/lib/api-v1";
import {
  confidencesAtOrAbove, decodeCursor, encodeCursor,
  parseIsoParam, parseLimitParam, parseWeaponTypeParam,
} from "@/lib/api-v1-core";

export const dynamic = "force-dynamic";

const EVENT_TYPES = ["strike", "clash", "movement"];

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  const p = new URL(req.url).searchParams;
  const since = parseIsoParam("since", p.get("since"));
  if (since && "code" in since) return jsonError(422, since.code, since.message, auth.rate);
  const until = parseIsoParam("until", p.get("until"));
  if (until && "code" in until) return jsonError(422, until.code, until.message, auth.rate);
  const limit = parseLimitParam(p.get("limit"));
  if (typeof limit !== "number") return jsonError(422, limit.code, limit.message, auth.rate);

  const theater = p.get("theater");
  if (theater && !(API_THEATERS as readonly string[]).includes(theater)) {
    return jsonError(422, "invalid_parameter", `theater must be one of ${API_THEATERS.join(", ")}`, auth.rate);
  }
  const eventType = p.get("event_type");
  if (eventType && !EVENT_TYPES.includes(eventType)) {
    return jsonError(422, "invalid_parameter", `event_type must be one of ${EVENT_TYPES.join(", ")}`, auth.rate);
  }
  const weaponType = parseWeaponTypeParam(p.get("weapon_type"));
  if (weaponType !== null && typeof weaponType !== "string") {
    return jsonError(422, weaponType.code, weaponType.message, auth.rate);
  }
  let confidences: string[] | null = null;
  const minConf = p.get("min_confidence");
  if (minConf) {
    const r = confidencesAtOrAbove(minConf);
    if ("code" in r) return jsonError(422, r.code, r.message, auth.rate);
    confidences = r;
  }
  const verifiedRaw = p.get("verified");
  if (verifiedRaw && verifiedRaw !== "true" && verifiedRaw !== "false") {
    return jsonError(422, "invalid_parameter", "verified must be true or false", auth.rate);
  }
  let cursor = null;
  const cursorRaw = p.get("cursor");
  if (cursorRaw) {
    const c = decodeCursor(cursorRaw);
    if ("code" in c) return jsonError(422, c.code, c.message, auth.rate);
    cursor = c;
  }

  type Row = {
    id: string; occurred_at: Date; event_type: string; theater: string;
    lat: number; lon: number; confidence: string; title: string; summary: string;
    source_count: number; platforms: string[]; weapon_type: string | null;
  };
  // Keyset pagination orders and compares on (occurred_at, id::text) so the
  // cursor predicate and ORDER BY use identical collation.
  const rows = await query<Row>(
    `SELECT e.id::text AS id, e.occurred_at, e.event_type,
            ${THEATER_CASE_SQL} AS theater,
            ST_Y(e.location)::float8 AS lat, ST_X(e.location)::float8 AS lon,
            e.confidence,
            CASE WHEN char_length(e.description) <= 80 THEN e.description
                 ELSE initcap(e.event_type) || ' — ' || e.location_name END AS title,
            e.description AS summary,
            COUNT(DISTINCT es.source_id)::int AS source_count,
            COALESCE(array_agg(DISTINCT s.platform) FILTER (WHERE s.platform IS NOT NULL), '{}') AS platforms,
            e.weapon_type
     FROM events e
     LEFT JOIN event_sources es ON es.event_id = e.id
     LEFT JOIN sources s        ON s.id = es.source_id
     WHERE e.published_at IS NOT NULL
       AND ($1::timestamptz IS NULL OR e.occurred_at >= $1)
       AND ($2::timestamptz IS NULL OR e.occurred_at <= $2)
       AND ($3::text IS NULL OR e.event_type = $3)
       AND ($4::text[] IS NULL OR e.confidence = ANY($4))
       AND ($5::boolean IS NULL OR (e.confidence = 'verified') = $5)
       AND ($6::text IS NULL OR ${THEATER_CASE_SQL} = $6)
       AND ($7::text IS NULL OR e.weapon_type = $7)
       AND ($8::timestamptz IS NULL OR (e.occurred_at, e.id::text) < ($8::timestamptz, $9::text))
     GROUP BY e.id
     ORDER BY e.occurred_at DESC, e.id::text DESC
     LIMIT $10::int`,
    [
      since, until, eventType, confidences,
      verifiedRaw === null ? null : verifiedRaw === "true",
      theater, weaponType, cursor?.occurredAt ?? null, cursor?.id ?? null, limit + 1,
    ],
  );

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return jsonOk(
    {
      events: page.map((r) => ({
        id: r.id,
        occurred_at: new Date(r.occurred_at).toISOString(),
        event_type: r.event_type,
        theater: r.theater,
        lat: r.lat,
        lon: r.lon,
        confidence: r.confidence,
        verified: r.confidence === "verified",
        title: r.title,
        summary: r.summary,
        source_count: r.source_count,
        platforms: r.platforms,
        weapon_type: r.weapon_type,
      })),
      next_cursor:
        rows.length > limit && last
          ? encodeCursor({ occurredAt: new Date(last.occurred_at).toISOString(), id: last.id })
          : null,
    },
    auth.rate,
  );
}
