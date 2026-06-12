import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { isDatabaseConfigured, query } from "@/lib/db";
import { isUndefinedTableError } from "@/lib/env";
import Panel from "@/components/ds/Panel";
import AdminNav from "@/components/ds/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tier Grants — Sentinel Admin" };

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";
const INPUT =
  "rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500";
const BTN =
  "px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider hover:bg-amber-500/20";

interface GrantRow {
  id:            string;
  clerk_user_id: string;
  tier:          string;
  note:          string | null;
  granted_by:    string;
  created_at:    Date;
  revoked_at:    Date | null;
}

type GrantsResult =
  | { kind: "ok"; rows: GrantRow[] }
  | { kind: "missing-table" }
  | { kind: "error" };

async function getGrants(): Promise<GrantsResult> {
  if (!isDatabaseConfigured()) return { kind: "ok", rows: [] };
  try {
    const rows = await query<GrantRow>(
      `SELECT id::text, clerk_user_id, tier, note, granted_by, created_at, revoked_at
       FROM tier_grants
       ORDER BY created_at DESC`,
    );
    return { kind: "ok", rows };
  } catch (err) {
    // Only undefined_table (42P01 — deploy ahead of migration) is benign.
    // Anything else (connection failure, pooler exhaustion, …) must surface
    // as a real error, not masquerade as "table isn't present".
    if (isUndefinedTableError(err)) return { kind: "missing-table" };
    console.error("[admin/grants] failed to load grants", {
      message: (err as { message?: string })?.message,
      code: (err as { code?: string })?.code,
    });
    return { kind: "error" };
  }
}

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") + "Z" : "—";
}

export default async function GrantsPage() {
  if (!(await isAdmin())) redirect("/sign-in");
  const result = await getGrants();

  return (
    <div className="admin-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Tier grants</h1>
          <p className="text-sm text-slate-400">
            Staff-issued customer-tier overrides. Precedence: active grant &gt; subscription &gt; watch.
            Admin <em>access</em> stays on the env allowlist — this table is tier only.
          </p>
          <AdminNav active="/admin/grants" />
        </div>

        <Panel padding="md" className="flex flex-col gap-3">
          <div className={LABEL}>Create / update grant</div>
          <form method="post" action="/api/admin/grants" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="action" value="create" />
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Clerk user id</span>
              <input name="clerk_user_id" required placeholder="user_…" className={`${INPUT} w-72 font-mono`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Tier</span>
              <select name="tier" required className={INPUT}>
                <option value="analyst">analyst</option>
                <option value="bureau">bureau</option>
                <option value="command">command</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-48">
              <span className={LABEL}>Note</span>
              <input name="note" placeholder="why this grant exists" className={INPUT} />
            </label>
            <button type="submit" className={BTN}>Grant</button>
          </form>
          <p className="text-xs text-slate-500">
            One grant per user — re-granting updates the tier/note and clears any revocation.
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <div className={LABEL}>Grants</div>
          {result.kind === "missing-table" ? (
            <div className="text-sm text-slate-400">
              The <span className="font-mono">tier_grants</span> table isn&rsquo;t present yet —
              migration 0031 applies on the next pipeline cycle. Until then, tiers resolve from
              subscriptions only.
            </div>
          ) : result.kind === "error" ? (
            <div className="text-sm text-red-400">
              Database error loading grants — this is not a missing table. Check the function
              logs; grants and entitlements may be degraded until the connection recovers.
            </div>
          ) : result.rows.length === 0 ? (
            <div className="text-sm text-slate-500">No grants yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["User", "Tier", "Note", "Granted by", "Created", "Status", ""].map((h) => (
                      <th key={h} className={`${LABEL} pb-2 pr-4`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((g) => (
                    <tr key={g.id} className="border-t border-slate-800/60 align-top">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-300">{g.clerk_user_id}</td>
                      <td className="py-2 pr-4 uppercase text-xs font-bold text-amber-400/90">{g.tier}</td>
                      <td className="py-2 pr-4 text-slate-400">{g.note ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">{g.granted_by}</td>
                      <td className="py-2 pr-4 font-data text-xs text-slate-400">{fmt(g.created_at)}</td>
                      <td className="py-2 pr-4 text-xs">
                        {g.revoked_at ? (
                          <span className="text-slate-500">revoked {fmt(g.revoked_at)}</span>
                        ) : (
                          <span className="text-emerald-400">active</span>
                        )}
                      </td>
                      <td className="py-2">
                        {!g.revoked_at && (
                          <form method="post" action="/api/admin/grants">
                            <input type="hidden" name="action" value="revoke" />
                            <input type="hidden" name="id" value={g.id} />
                            <button
                              type="submit"
                              className="px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] font-semibold uppercase tracking-wider hover:bg-red-500/20"
                            >
                              Revoke
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
