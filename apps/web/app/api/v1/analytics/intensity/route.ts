import { query } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk, THEATER_CASE_SQL, API_THEATERS } from "@/lib/api-v1";
import { parseIsoParam } from "@/lib/api-v1-core";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  const p = new URL(req.url).searchParams;
  const since = parseIsoParam("since", p.get("since"));
  if (!since) return jsonError(422, "invalid_parameter", "since is required (ISO 8601)", auth.rate);
  if ("code" in since) return jsonError(422, since.code, since.message, auth.rate);
  const until = parseIsoParam("until", p.get("until"));
  if (!until) return jsonError(422, "invalid_parameter", "until is required (ISO 8601)", auth.rate);
  if ("code" in until) return jsonError(422, until.code, until.message, auth.rate);
  const theater = p.get("theater");
  if (theater && !(API_THEATERS as readonly string[]).includes(theater)) {
    return jsonError(422, "invalid_parameter", `theater must be one of ${API_THEATERS.join(", ")}`, auth.rate);
  }

  type Row = { date: string; theater: string; events: number; verified: number };
  // Deterministic daily buckets — plain SQL over published events, UTC days.
  const rows = await query<Row>(
    `SELECT to_char(date_trunc('day', e.occurred_at AT TIME ZONE 'utc'), 'YYYY-MM-DD') AS date,
            ${THEATER_CASE_SQL} AS theater,
            COUNT(*)::int AS events,
            COUNT(*) FILTER (WHERE e.confidence = 'verified')::int AS verified
     FROM events e
     WHERE e.published_at IS NOT NULL
       AND e.occurred_at >= $1 AND e.occurred_at <= $2
       AND ($3::text IS NULL OR ${THEATER_CASE_SQL} = $3)
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2 ASC`,
    [since, until, theater],
  );

  return jsonOk({ intensity: rows }, auth.rate);
}
