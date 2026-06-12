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

  type Row = {
    source: string; platform: string;
    posts: number; events_contributed: number; verified_participation: number;
  };
  // Per source over the window: raw posts authored, distinct published events
  // contributed to, and distinct verified events among those. Plain joins —
  // every number recomputable from events/raw_posts/event_sources.
  const rows = await query<Row>(
    `SELECT s.display_name AS source, s.platform,
            COUNT(DISTINCT rp.id) FILTER (WHERE rp.posted_at >= $1 AND rp.posted_at <= $2)::int AS posts,
            COUNT(DISTINCT e.id)::int AS events_contributed,
            COUNT(DISTINCT e.id) FILTER (WHERE e.confidence = 'verified')::int AS verified_participation
     FROM sources s
     LEFT JOIN raw_posts rp ON rp.source_id = s.id
     LEFT JOIN event_sources es ON es.raw_post_id = rp.id
     LEFT JOIN events e ON e.id = es.event_id
       AND e.published_at IS NOT NULL
       AND e.occurred_at >= $1 AND e.occurred_at <= $2
       AND ($3::text IS NULL OR ${THEATER_CASE_SQL} = $3)
     GROUP BY s.id
     HAVING COUNT(DISTINCT rp.id) FILTER (WHERE rp.posted_at >= $1 AND rp.posted_at <= $2) > 0
         OR COUNT(DISTINCT e.id) > 0
     ORDER BY events_contributed DESC, posts DESC`,
    [since, until, theater],
  );

  return jsonOk({ source_stats: rows }, auth.rate);
}
