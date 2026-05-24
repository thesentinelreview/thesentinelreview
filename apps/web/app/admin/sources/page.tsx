import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  approveCandidate,
  rejectCandidate,
  deferCandidate,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source Review Queue — Sentinel Admin" };

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

const KNOWN_THEATERS = ["ukraine", "iran", "sudan", "myanmar"] as const;
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
    <main className="mx-auto max-w-3xl px-4 py-6 font-[family-name:var(--font-plex-sans)]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Source Review Queue</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Candidates discovered by mention-mining from active sources.
          Approve to promote into the production source list.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTER_TABS.map((tab) => {
          const active = tab.value === status;
          return (
            <a
              key={tab.value}
              href={`/admin/sources?status=${tab.value}`}
              className={
                "rounded-full border px-3 py-1.5 transition " +
                (active
                  ? "border-amber-400 bg-amber-400/10 text-amber-200"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500")
              }
            >
              {tab.label}{" "}
              <span className="ml-1 text-xs text-neutral-500">
                {countMap[tab.value] ?? 0}
              </span>
            </a>
          );
        })}
      </nav>

      {candidates.length === 0 ? (
        <p className="rounded-md border border-neutral-800 bg-neutral-900/40 p-6 text-center text-sm text-neutral-400">
          No candidates with status &quot;{status}&quot;.
        </p>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => (
            <CandidateCard key={c.id} c={c} canAct={status === "discovered"} />
          ))}
        </ul>
      )}
    </main>
  );
}

function CandidateCard({
  c,
  canAct,
}: {
  c: CandidateRow;
  canAct: boolean;
}) {
  const platformBadgeColor: Record<string, string> = {
    x:        "bg-sky-500/15 text-sky-300",
    telegram: "bg-blue-500/15 text-blue-300",
    bluesky:  "bg-indigo-500/15 text-indigo-300",
    rss:      "bg-orange-500/15 text-orange-300",
    gdelt:    "bg-emerald-500/15 text-emerald-300",
  };

  const profileLink =
    c.platform === "x"        ? `https://x.com/${c.handle}` :
    c.platform === "telegram" ? `https://t.me/${c.handle}` :
    c.platform === "bluesky"  ? `https://bsky.app/profile/${c.handle}` :
    c.url ?? null;

  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${platformBadgeColor[c.platform] ?? "bg-neutral-700 text-neutral-200"}`}>
          {c.platform}
        </span>
        {profileLink ? (
          <a
            href={profileLink}
            target="_blank"
            rel="noreferrer noopener"
            className="font-[family-name:var(--font-plex-mono)] text-base text-amber-200 hover:underline"
          >
            {c.handle}
          </a>
        ) : (
          <span className="font-[family-name:var(--font-plex-mono)] text-base text-amber-200">
            {c.handle}
          </span>
        )}
        <span className="text-sm text-neutral-500">
          · {c.mention_count} mention{c.mention_count === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-neutral-600">
          · first seen {relativeTime(c.first_seen_at)}
        </span>
      </div>

      {c.mentioning_handles.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          Mentioned by:{" "}
          <span className="font-[family-name:var(--font-plex-mono)] text-neutral-300">
            {c.mentioning_handles.slice(0, 5).join(", ")}
          </span>
        </p>
      )}

      {c.sample_context && (
        <blockquote className="mt-2 border-l-2 border-neutral-700 pl-3 text-xs italic text-neutral-400">
          {c.sample_context}
        </blockquote>
      )}

      {canAct && (
        <div className="mt-4 space-y-3">
          {/* Approve */}
          <form action={approveCandidate} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
            <input type="hidden" name="candidate_id" value={c.id} />

            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Approve
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-neutral-400">Theaters:</span>
              {KNOWN_THEATERS.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 text-neutral-300">
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

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <label className="text-neutral-400">
                Trust tier:{" "}
                <select
                  name="trust_tier"
                  defaultValue={2}
                  className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-200"
                >
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
              className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600"
            />

            <button
              type="submit"
              className="mt-2 w-full rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-300"
            >
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
              className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600"
            />
            <button
              type="submit"
              className="rounded border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
            >
              Reject
            </button>
          </form>

          {/* Defer */}
          <form action={deferCandidate}>
            <input type="hidden" name="candidate_id" value={c.id} />
            <button
              type="submit"
              className="w-full rounded border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800/40"
            >
              Defer (hide from queue)
            </button>
          </form>
        </div>
      )}
    </li>
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
