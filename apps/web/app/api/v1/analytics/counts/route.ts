import { query } from "@/lib/db";
import { authenticateApiRequest, jsonError, jsonOk, THEATER_CASE_SQL } from "@/lib/api-v1";
import { parseIsoParam, GROUP_BY_VALUES } from "@/lib/api-v1-core";

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

  const groupBy = p.get("group_by");
  if (!groupBy || !(GROUP_BY_VALUES as readonly string[]).includes(groupBy)) {
    return jsonError(422, "invalid_parameter", `group_by must be one of ${GROUP_BY_VALUES.join(", ")}`, auth.rate);
  }
  // Whitelisted mapping — never interpolates user input.
  const groupExpr =
    groupBy === "event_type" ? "e.event_type"
    : groupBy === "confidence_band" ? "e.confidence"
    : groupBy === "weapon_type" ? "e.weapon_type"
    : THEATER_CASE_SQL;

  // weapon_type is the only nullable group key: unclassified events surface as
  // one key:null row so the counts always reconcile with /events totals over
  // the same window (the watchfloor panel, by contrast, is classified-only).
  type Row = { key: string | null; total: number };
  const rows = await query<Row>(
    `SELECT ${groupExpr} AS key, COUNT(*)::int AS total
     FROM events e
     WHERE e.published_at IS NOT NULL
       AND e.occurred_at >= $1 AND e.occurred_at <= $2
     GROUP BY 1
     ORDER BY 2 DESC`,
    [since, until],
  );

  return jsonOk({ group_by: groupBy, counts: rows }, auth.rate);
}
