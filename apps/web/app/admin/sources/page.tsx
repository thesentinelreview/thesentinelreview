import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { isDatabaseConfigured, query } from "@/lib/db";
import Panel from "@/components/ds/Panel";
import AdminNav from "@/components/ds/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources — Sentinel Admin" };

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";

interface SourceRow {
  id:           string;
  display_name: string;
  handle:       string;
  platform:     string;
  theaters:     string[];
  last_post_at: Date | null;
  is_active:    boolean;
}

async function getSources(): Promise<SourceRow[]> {
  if (!isDatabaseConfigured()) return [];
  return query<SourceRow>(
    `SELECT id::text, display_name, handle, platform, theaters, last_post_at, is_active
     FROM sources
     ORDER BY is_active DESC, last_post_at DESC NULLS LAST, display_name ASC`,
  );
}

function fmtLast(d: Date | null): string {
  if (!d) return "never";
  const hours = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  if (hours < 1) return "<1h ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function SourcesAdminPage() {
  if (!(await isAdmin())) redirect("/sign-in");
  const sources = await getSources();
  const active = sources.filter((s) => s.is_active).length;

  return (
    <div className="admin-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
          <p className="text-sm text-slate-400">
            {active} active of {sources.length}. The toggle writes <span className="font-mono">sources.is_active</span> —
            the ingest scheduler skips inactive sources on its next cycle. Candidate onboarding lives
            in the Review Queue.
          </p>
          <AdminNav active="/admin/sources" />
        </div>

        <Panel padding="md" className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {["Source", "Platform", "Theaters", "Last post", "Active", ""].map((h) => (
                    <th key={h} className={`${LABEL} pb-2 pr-4`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-t border-slate-800/60">
                    <td className="py-2 pr-4">
                      <div className="text-slate-200">{s.display_name}</div>
                      <div className="font-mono text-xs text-slate-500">{s.handle}</div>
                    </td>
                    <td className="py-2 pr-4 uppercase text-xs font-data text-slate-400">{s.platform}</td>
                    <td className="py-2 pr-4 text-xs text-slate-400">{s.theaters.join(", ")}</td>
                    <td className="py-2 pr-4 font-data text-xs text-slate-400">{fmtLast(s.last_post_at)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {s.is_active ? (
                        <span className="text-emerald-400">active</span>
                      ) : (
                        <span className="text-slate-500">off</span>
                      )}
                    </td>
                    <td className="py-2">
                      <form method="post" action="/api/admin/sources">
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className={`px-2 py-1 rounded border text-[10px] font-semibold uppercase tracking-wider ${
                            s.is_active
                              ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          }`}
                        >
                          {s.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
