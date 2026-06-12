import { query } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.code, auth.message, auth.rate);

  type Row = {
    name: string; platform: string; theaters: string[];
    is_active: boolean; last_post_at: Date | null;
  };
  // The source registry as a transparency artifact.
  const rows = await query<Row>(
    `SELECT display_name AS name, platform, theaters, is_active, last_post_at
     FROM sources
     ORDER BY display_name ASC`,
  );

  return jsonOk(
    {
      sources: rows.map((r) => ({
        ...r,
        last_post_at: r.last_post_at ? new Date(r.last_post_at).toISOString() : null,
      })),
    },
    auth.rate,
  );
}
