import Link from "next/link";
import Panel from "@/components/ds/Panel";

export const metadata = {
  title: "API Documentation — The Sentinel Review",
  description: "Read API v1: events, briefings, sources, and deterministic analytics endpoints.",
};

const H2 = "text-lg font-bold text-slate-100 mt-2";
const CODE = "block rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre";
const P = "text-sm text-slate-400 leading-relaxed";

const BASE = "https://dashboard.thesentinelreview.com";

function Endpoint({ title, desc, curl }: { title: string; desc: string; curl: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-sm text-amber-400">{title}</div>
      <p className={P}>{desc}</p>
      <code className={CODE}>{curl}</code>
    </div>
  );
}

export default function ApiDocsPage() {
  const K = `-H "Authorization: Bearer snl_live_YOUR_KEY"`;
  return (
    <div className="docs-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-3xl mx-auto px-5 py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight">Read API v1</h1>
          <p className={P}>
            Deterministic, recomputable analytics over stored OSINT conflict events. No LLM at
            request time, no predictions — every number this API returns can be reproduced with a
            SQL query over the same stored data.
          </p>
        </div>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>Authentication</h2>
          <p className={P}>
            Create a key on your <Link className="text-amber-400" href="/account">account page</Link>{" "}
            (Analyst subscription required) and send it on every request. Keys are shown once at
            creation; we store only a hash. Your tier is re-checked live on every call — a lapsed
            subscription returns <code>403 tier_insufficient</code>.
          </p>
          <code className={CODE}>{`curl ${K} \\
  "${BASE}/api/v1/events?theater=ukraine&limit=5"`}</code>
          <h2 className={H2}>Rate limits</h2>
          <p className={P}>
            Analyst: 1,000 calls per UTC day. Every response carries{" "}
            <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, and{" "}
            <code>X-RateLimit-Reset</code> (UTC-midnight epoch seconds). Over the limit →{" "}
            <code>429 rate_limited</code>.
          </p>
          <h2 className={H2}>Errors</h2>
          <p className={P}>
            Failures are <code>{`{"error": "...", "code": "..."}`}</code> with status 401
            (invalid_key), 403 (tier_insufficient), 404 (not_found), 422 (invalid_parameter), or
            429 (rate_limited).
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-6">
          <h2 className={H2}>Endpoints</h2>
          <Endpoint
            title="GET /api/v1/events"
            desc="Published events, newest first. Filters: theater, since/until (ISO 8601), event_type (strike|clash|movement), min_confidence (unconfirmed|partial|verified), verified (true|false). limit ≤ 200 (default 50); keyset pagination via next_cursor. The theater field is derived from event coordinates against the five canonical theater bounding boxes (israel→ukraine→iran→sudan→myanmar precedence); title is the event description when ≤80 chars, otherwise 'Type — location'."
            curl={`curl ${K} \\
  "${BASE}/api/v1/events?theater=ukraine&since=2026-06-01T00:00:00Z&min_confidence=partial&limit=50"`}
          />
          <Endpoint
            title="GET /api/v1/events/:id"
            desc="Event detail including sources[{platform, posted_at, url}] — the same source data an Analyst sees in the dashboard."
            curl={`curl ${K} \\
  "${BASE}/api/v1/events/EVENT_UUID"`}
          />
          <Endpoint
            title="GET /api/v1/briefings and /api/v1/briefings/:id"
            desc="AI-generated theater briefings (labeled as such in every payload, with the standard disclaimer on detail). List returns id, theater, published_at, title; detail returns full text and referenced event ids."
            curl={`curl ${K} \\
  "${BASE}/api/v1/briefings?limit=10"`}
          />
          <Endpoint
            title="GET /api/v1/sources"
            desc="The full source registry as a transparency artifact: name, platform, theaters, is_active, last_post_at."
            curl={`curl ${K} \\
  "${BASE}/api/v1/sources"`}
          />
          <Endpoint
            title="GET /api/v1/analytics/intensity"
            desc="Daily buckets [{date, theater, events, verified}] between since and until (both required), optionally filtered to one theater. UTC days."
            curl={`curl ${K} \\
  "${BASE}/api/v1/analytics/intensity?since=2026-06-01T00:00:00Z&until=2026-06-12T00:00:00Z&theater=israel"`}
          />
          <Endpoint
            title="GET /api/v1/analytics/counts"
            desc="Totals between since and until grouped by event_type, theater, or confidence_band."
            curl={`curl ${K} \\
  "${BASE}/api/v1/analytics/counts?since=2026-06-01T00:00:00Z&until=2026-06-12T00:00:00Z&group_by=event_type"`}
          />
          <Endpoint
            title="GET /api/v1/analytics/source-stats"
            desc="Per-source contribution between since and until: posts authored, distinct published events contributed to, and verified events among those."
            curl={`curl ${K} \\
  "${BASE}/api/v1/analytics/source-stats?since=2026-06-01T00:00:00Z&until=2026-06-12T00:00:00Z"`}
          />
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <h2 className={H2}>Exports</h2>
          <p className={P}>
            Analyst and above can download the events in the current dashboard view — the{" "}
            <strong className="text-slate-300">Export</strong> control next to the theater/window
            selectors on the{" "}
            <Link className="text-amber-400" href="/">
              Sentinel View
            </Link>
            . Exports use your signed-in session, not an API key.
          </p>
          <p className={P}>
            <strong className="text-slate-300">Formats:</strong> CSV and JSON. Each row carries the
            event&rsquo;s id, timestamp (ISO 8601 UTC), type, bbox-derived theater, location,
            coordinates, source count, confidence, platforms, and summary.
          </p>
          <p className={P}>
            <strong className="text-slate-300">Windows:</strong> 24H / 7D / 30D / 90D, or a custom
            date range up to 90 days. There is no full-archive export — the archive stays queryable
            here in the dashboard and via the paginated API.
          </p>
          <p className={P}>
            <strong className="text-slate-300">Caps:</strong> 10,000 rows per file (files at the cap
            are flagged truncated) and 20 exports per UTC day, metered separately from your API call
            quota. Over the limit → <code>429</code>, resetting at 00:00 UTC.
          </p>
          <p className={P}>
            Every file carries the data license: confidence-labeled OSINT, not all events verified;
            personal and internal-org use only; no redistribution. Full terms in the{" "}
            <Link className="text-amber-400" href="/terms">
              Terms of Service
            </Link>
            .
          </p>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-2">
          <h2 className={H2}>Honesty notes</h2>
          <p className={P}>
            The archive contains everything we ingest, confidence-labeled — not everything
            verified. Briefings are AI-generated analysis over open-source reporting; locations
            and details unverified; not for operational use.
          </p>
          <p className={P}>
            Licensing: API data access is for personal and internal organizational use — no
            redistribution, republication, resale, or bulk sharing. The full data license is in
            the{" "}
            <Link className="text-amber-400" href="/terms">
              Terms of Service
            </Link>
            .
          </p>
        </Panel>
      </div>
    </div>
  );
}
