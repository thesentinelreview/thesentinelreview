import { query } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk } from "@/lib/api-v1";
import { parseLimitParam } from "@/lib/api-v1-core";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  const p = new URL(req.url).searchParams;
  const limit = parseLimitParam(p.get("limit"));
  if (typeof limit !== "number") return jsonError(422, limit.code, limit.message, auth.rate);

  type Row = { id: string; theater: string; published_at: Date; title: string; status: string };
  // Title derivation matches the dashboard headline rule: the first sentence
  // of the briefing text, truncated — deterministic from stored data.
  const rows = await query<Row>(
    `SELECT id::text AS id, theater,
            COALESCE(published_at, created_at) AS published_at,
            left(split_part(COALESCE(published_text, draft_text), '.', 1), 120) AS title,
            status
     FROM briefings
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT $1::int`,
    [limit],
  );

  return jsonOk(
    {
      briefings: rows.map((r) => ({
        id: r.id,
        theater: r.theater,
        published_at: new Date(r.published_at).toISOString(),
        title: r.title,
        ai_generated: true,
        reviewed: r.status === "published",
      })),
    },
    auth.rate,
  );
}
