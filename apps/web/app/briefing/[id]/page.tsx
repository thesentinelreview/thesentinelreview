import Link from "next/link";
import { notFound } from "next/navigation";
import { getFullBriefing, getEventDetail } from "@/lib/queries";
import { resolveTheater } from "@/data/theaters";
import Panel from "@/components/ds/Panel";
import { CONFIDENCE_STYLES, EVENT_TYPE_STYLES } from "@/components/ds/tokens";

export const dynamic = "force-dynamic";

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theater?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const theater = resolveTheater(sp.theater);
  const brief = await getFullBriefing(id);
  if (!brief) notFound();

  const referencedEvents = (
    await Promise.all(brief.referenced_event_ids.map((eid) => getEventDetail(eid)))
  ).filter((e): e is NonNullable<typeof e> => e !== null);

  const embedIframe = `<iframe src="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/embed/briefing/${id}" width="100%" height="220" frameborder="0" style="border:none;background:#0c0d10"></iframe>`;

  return (
    <div className="briefing-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-6 pb-20 flex flex-col gap-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-data text-slate-500">
          <Link href="/" className="text-slate-400 hover:text-red-400 transition-colors">← Map</Link>
          <span className="text-slate-700">/</span>
          <span>Briefings</span>
          <span className="text-slate-700">/</span>
          <span className="font-mono text-slate-600 truncate">{id}</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-3 pb-4 border-b border-slate-800/60">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">{theater.briefingTitle}</h1>
            <div className="flex items-center gap-2 shrink-0">
              {brief.reviewed ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-data tracking-[0.08em] uppercase border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  Reviewed
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-data tracking-[0.08em] uppercase border border-amber-500/30 bg-amber-500/10 text-amber-400">
                  AI Draft
                </span>
              )}
              <a
                href="#embed-this-briefing"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-data tracking-[0.08em] uppercase border border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600 hover:text-slate-100 transition-colors"
              >
                Embed ↗
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-data text-slate-500">
            <span>{brief.date}</span>
            <span className="text-slate-700">·</span>
            <span>{brief.utc_time}</span>
            <span className="text-slate-700">·</span>
            <span>Compiled from {brief.source_count} sources</span>
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Main — briefing */}
          <Panel padding="md" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
              {brief.full_paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div id="embed-this-briefing" className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">Embed this briefing</div>
              <textarea
                className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 text-xs font-mono text-slate-300 p-3 focus:outline-none focus:border-slate-600"
                readOnly
                rows={3}
                defaultValue={embedIframe}
              />
            </div>
          </Panel>

          {/* Sidebar */}
          <div className="flex flex-col gap-6">
            {/* Confidence breakdown */}
            <Panel padding="sm" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-data tracking-[0.12em] uppercase text-slate-400">Confidence breakdown</h2>
                <span className="text-[10px] font-data text-slate-600">this briefing</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${CONFIDENCE_STYLES.verified.dot}`} />
                  <span className="text-slate-300 flex-1">Verified</span>
                  <span className="font-data tabular-nums text-slate-100">{brief.confidence_summary.verified}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${CONFIDENCE_STYLES.partial.dot}`} />
                  <span className="text-slate-300 flex-1">Partial</span>
                  <span className="font-data tabular-nums text-slate-100">{brief.confidence_summary.partial}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${CONFIDENCE_STYLES.unconfirmed.dot}`} />
                  <span className="text-slate-300 flex-1">Unconfirmed</span>
                  <span className="font-data tabular-nums text-slate-100">{brief.confidence_summary.unconfirmed}</span>
                </div>
              </div>
            </Panel>

            {/* Referenced events */}
            <Panel padding="sm" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-data tracking-[0.12em] uppercase text-slate-400">Referenced events</h2>
                <span className="text-[10px] font-data text-slate-600">{referencedEvents.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {referencedEvents.map((evt) => (
                  <Link
                    key={evt.id}
                    href={`/event/${evt.id}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 hover:border-slate-600 transition-colors no-underline"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_STYLES[evt.event_type]?.dot ?? "bg-slate-500"}`} />
                    <span className="flex-1 text-sm text-slate-200 truncate group-hover:text-slate-100">{evt.location_name}</span>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">{evt.id.slice(0, 8).toUpperCase()}</span>
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
