import { queryOne } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(422, "invalid_parameter", "id must be a UUID", auth.rate);

  type Row = {
    id: string; theater: string; published_at: Date; status: string;
    text: string; event_ids: string[];
  };
  const row = await queryOne<Row>(
    `SELECT id::text AS id, theater,
            COALESCE(published_at, created_at) AS published_at, status,
            COALESCE(published_text, draft_text) AS text,
            event_ids::text[] AS event_ids
     FROM briefings
     WHERE id = $1::uuid`,
    [id],
  );
  if (!row) return jsonError(404, "not_found", "No briefing with that id.", auth.rate);

  return jsonOk(
    {
      id: row.id,
      theater: row.theater,
      published_at: new Date(row.published_at).toISOString(),
      ai_generated: true,
      reviewed: row.status === "published",
      disclaimer:
        "AI-generated analysis. Events sourced from open-source reporting; locations and details unverified. Not for operational use.",
      text: row.text,
      referenced_event_ids: row.event_ids,
    },
    auth.rate,
  );
}
