import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { isDatabaseConfigured, query, queryOne } from "@/lib/db";
import { FOUNDING_CAP } from "@/lib/stripe";
import Panel from "@/components/ds/Panel";
import AdminNav from "@/components/ds/AdminNav";

export const dynamic = "force-dynamic";

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";
const NUM = "font-data text-2xl font-semibold tabular-nums text-slate-100 leading-none";

interface FoundingRow {
  clerk_user_id: string;
  tier:          string;
  status:        string;
  created_at:    Date;
  updated_at:    Date;
}

async function getLedger() {
  if (!isDatabaseConfigured()) return { claimed: 0, freed: 0, rows: [] as FoundingRow[] };
  // Claimed uses the byte-identical qualifying-status filter shared with the
  // /pricing counter and the checkout cap guard — the three must agree.
  const [counts, rows] = await Promise.all([
    queryOne<{ claimed: number; freed: number }>(
      `SELECT
         count(*) FILTER (WHERE status IN ('active', 'past_due', 'trialing'))::int     AS claimed,
         count(*) FILTER (WHERE status NOT IN ('active', 'past_due', 'trialing'))::int AS freed
       FROM user_subscriptions
       WHERE is_founding`,
    ),
    query<FoundingRow>(
      `SELECT clerk_user_id, tier, status, created_at, updated_at
       FROM user_subscriptions
       WHERE is_founding
       ORDER BY created_at ASC`,
    ),
  ]);
  return { claimed: counts?.claimed ?? 0, freed: counts?.freed ?? 0, rows };
}

function fmt(d: Date): string {
  return new Date(d).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export default async function FoundingPage() {
  if (!(await isAdmin())) redirect("/sign-in");
  const { claimed, freed, rows } = await getLedger();
  const remaining = Math.max(0, FOUNDING_CAP - claimed);

  return (
    <div className="admin-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Founding ledger</h1>
          <p className="text-sm text-slate-400">
            Seat math from the same query the /pricing counter and checkout cap guard use.
            Cancelled rows keep the founding flag (history) but free their seat.
          </p>
          <AdminNav active="/admin/founding" />
        </div>

        <Panel padding="md">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <div className={NUM}>{claimed}</div>
              <div className={LABEL}>Seats claimed</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={NUM}>{freed}</div>
              <div className={LABEL}>Seats freed</div>
            </div>
            <div className={`flex flex-col gap-1 ${remaining === 0 ? "text-red-400" : ""}`}>
              <div className={NUM}>{remaining}</div>
              <div className={LABEL}>Remaining</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={NUM}>{FOUNDING_CAP}</div>
              <div className={LABEL}>Cap</div>
            </div>
          </div>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <div className={LABEL}>Founding rows ({rows.length})</div>
          {rows.length === 0 ? (
            <div className="text-sm text-slate-500">No founding rows yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["#", "User", "Tier", "Status", "Created", "Updated"].map((h) => (
                      <th key={h} className={`${LABEL} pb-2 pr-4`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.clerk_user_id} className="border-t border-slate-800/60">
                      <td className="py-2 pr-4 font-data text-xs text-slate-500">{i + 1}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-300">{r.clerk_user_id}</td>
                      <td className="py-2 pr-4 uppercase text-xs font-bold text-amber-400/90">{r.tier}</td>
                      <td className="py-2 pr-4 text-xs">
                        {["active", "past_due", "trialing"].includes(r.status) ? (
                          <span className="text-emerald-400">{r.status}</span>
                        ) : (
                          <span className="text-slate-500">{r.status} (seat freed)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-data text-xs text-slate-400">{fmt(r.created_at)}</td>
                      <td className="py-2 font-data text-xs text-slate-400">{fmt(r.updated_at)}</td>
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
