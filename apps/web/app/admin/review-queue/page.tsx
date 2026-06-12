import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import Panel from "@/components/ds/Panel";
import Badge from "@/components/ds/Badge";
import FilterChip from "@/components/ds/FilterChip";
import AdminNav from "@/components/ds/AdminNav";
import {
  approveCandidate,
  rejectCandidate,
  deferCandidate,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source Review Queue — Sentinel Admin" };

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";
const INPUT =
  "rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500";
const BTN =
  "px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider hover:bg-amber-500/20";

type CandidateStatus =
  | "discovered"
  | "shadow_pending"
  | "shadow_active"
  | "shadow_complete"
  | "approved"
  | "rejected"
  | "auto_rejected"
  | "expired";

interface CandidateRow {
  id:                   string;
  handle:               string;
  platform:             string;
  display_name:         string | null;
  url:                  string | null;
  discovery_method:     string;
  status:               CandidateStatus;
  mention_count:        number;
  first_seen_at:        string;
  last_seen_at:         string;
  suggested_theaters:   string[] | null;
  mentioning_handles:   string[];
  sample_context:       string | null;
}

const KNOWN_THEATERS = ["ukraine", "iran", "sudan", "myanmar", "israel"] as const;
const FILTER_TABS: { value: CandidateStatus; label: string }[] = [
  { value: "discovered", label: "New" },
  { value: "approved",   label: "Approved" },
  { value: "rejected",   label: "Rejected" },
  { value: "expired",    label: "Deferred" },
];

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const params = await searchParams;
  const status: CandidateStatus =
    (FILTER_TABS.find((t) => t.value === params.status)?.value ?? "discovered");

  const candidates = await query<CandidateRow>(
    `
    SELECT
      c.id, c.handle, c.platform, c.display_name, c.url,
      c.discovery_method, c.status, c.mention_count,
      c.first_seen_at, c.last_seen_at, c.suggested_theaters,
      COALESCE(
        (SELECT array_agg(DISTINCT s.handle ORDER BY s.handle)
         FROM candidate_mentions cm
         JOIN sources s ON s.id = cm.mentioning_source_id
         WHERE cm.candidate_id = c.id
         LIMIT 5),
        ARRAY[]::text[]
      ) AS mentioning_handles,
      (SELECT cm.mention_context
       FROM candidate_mentions cm
       WHERE cm.candidate_id = c.id AND cm.mention_context IS NOT NULL
       ORDER BY cm.observed_at DESC
       LIMIT 1) AS sample_context
    FROM candidate_sources c
    WHERE c.status = $1
    ORDER BY c.mention_count DESC, c.last_seen_at DESC
    LIMIT 100
    `,
    [status],
  );

  const counts = await query<{ status: CandidateStatus; n: number }>(
    `SELECT status, count(*)::int AS n FROM candidate_sources GROUP BY status`,
  );
  const countMap = Object.fromEntries(counts.map((r) => [r.status, r.n]));

  return (
    <div className="admin-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-8 flex flex-col gap-5">
        <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Source review queue</h1>
          <p className="text-sm text-slate-400">
            Candidates discovered by mention-mining from active sources.
            Approve to promote into the production source list.
          </p>
          <AdminNav active="/admin/review-queue" />
        </div>

        <nav aria-label="Queue status" className="flex flex-wrap items-center gap-2">
          {FILTER_TABS.map((tab) => (
            <FilterChip
              key={tab.value}
              href={`/admin/review-queue?status=${tab.value}`}
              active={tab.value === status}
            >
              {tab.label}
              <span className="ml-1.5 opacity-60">{countMap[tab.value] ?? 0}</span>
            </FilterChip>
          ))}
        </nav>

        {candidates.length === 0 ? (
          <Panel padding="md" className="text-center text-sm text-slate-400">
            No candidates with status &quot;{status}&quot;.
          </Panel>
        ) : (
          <ul className="flex flex-col gap-3">
            {candidates.map((c) => (
              <CandidateCard key={c.id} c={c} canAct={status === "discovered"} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  c,
  canAct,
}: {
  c: CandidateRow;
  canAct: boolean;
}) {
  const profileLink =
    c.platform === "x"        ? `https://x.com/${c.handle}` :
    c.platform === "telegram" ? `https://t.me/${c.handle}` :
    c.platform === "bluesky"  ? `https://bsky.app/profile/${c.handle}` :
    c.url ?? null;

  return (
    <Panel as="li" padding="sm" hover className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <Badge variant="platform" value={c.platform} />
        {profileLink ? (
          <a
            href={profileLink}
            target="_blank"
            rel="noreferrer noopener"
            className="font-data text-base text-amber-400 hover:text-amber-300 hover:underline"
          >
            {c.handle}
          </a>
        ) : (
          <span className="font-data text-base text-amber-400">{c.handle}</span>
        )}
        <span className="text-sm text-slate-500">
          · {c.mention_count} mention{c.mention_count === 1 ? "" : "s"}
        </span>
        <span className="text-xs font-data text-slate-600">
          · first seen {relativeTime(c.first_seen_at)}
        </span>
      </div>

      {c.mentioning_handles.length > 0 && (
        <p className="text-xs text-slate-400">
          Mentioned by:{" "}
          <span className="font-data text-slate-300">
            {c.mentioning_handles.slice(0, 5).join(", ")}
          </span>
        </p>
      )}

      {c.sample_context && (
        <blockquote className="border-l-2 border-slate-700 pl-3 text-xs italic text-slate-400">
          {c.sample_context}
        </blockquote>
      )}

      {canAct && (
        <div className="mt-2 flex flex-col gap-3">
          {/* Approve */}
          <form
            action={approveCandidate}
            className="flex flex-col gap-2 rounded-lg border border-slate-800/60 bg-slate-950/60 p-3"
          >
            <input type="hidden" name="candidate_id" value={c.id} />

            <div className={LABEL}>Approve</div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-slate-400">Theaters:</span>
              {KNOWN_THEATERS.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 text-slate-300">
                  <input
                    type="checkbox"
                    name="theaters"
                    value={t}
                    defaultChecked={c.suggested_theaters?.includes(t) ?? false}
                    className="accent-amber-400"
                  />
                  {t}
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-slate-400">
                Trust tier:
                <select name="trust_tier" defaultValue={2} className={INPUT}>
                  <option value={1}>1 — verified outlet</option>
                  <option value={2}>2 — standard</option>
                  <option value={3}>3 — partisan / monitor only</option>
                </select>
              </label>
            </div>

            <input
              type="text"
              name="notes"
              placeholder="Notes (optional)"
              className={`${INPUT} w-full`}
            />

            <button type="submit" className={`${BTN} w-full`}>
              Approve &amp; promote
            </button>
          </form>

          {/* Reject */}
          <form action={rejectCandidate} className="flex gap-2">
            <input type="hidden" name="candidate_id" value={c.id} />
            <input
              type="text"
              name="rejection_reason"
              placeholder="Rejection reason (optional)"
              className={`${INPUT} flex-1`}
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-semibold uppercase tracking-wider hover:bg-red-500/20"
            >
              Reject
            </button>
          </form>

          {/* Defer */}
          <form action={deferCandidate}>
            <input type="hidden" name="candidate_id" value={c.id} />
            <button
              type="submit"
              className="w-full px-3 py-1.5 rounded border border-slate-700 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:border-slate-500"
            >
              Defer (hide from queue)
            </button>
          </form>
        </div>
      )}
    </Panel>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60)     return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
