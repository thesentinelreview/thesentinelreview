import Link from "next/link";
import { notFound } from "next/navigation";
import type { EventSource, EvidenceItem, ChangeHistoryEntry } from "@/lib/types";
import { resolveTheater } from "@/data/theaters";
import { getEventDetail } from "@/lib/queries";
import { cn } from "@/lib/cn";
import Panel from "@/components/ds/Panel";
import Badge from "@/components/ds/Badge";
import { EVENT_TYPE_STYLES, CONFIDENCE_STYLES } from "@/components/ds/tokens";

export const dynamic = "force-dynamic";

function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

// DS section-header label + small meta/count label.
const SECTION = "text-[11px] font-data tracking-[0.18em] uppercase text-slate-400";
const META = "text-[10px] font-data tracking-[0.08em] uppercase text-slate-500";
// Token-driven badge (event-type / confidence): DS dot + label, coloured from tokens.
const TOKEN_BADGE = "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-data tracking-[0.08em] uppercase";
// Source relationship — DS-neutral slate badge (no invented colours).
const REL_BADGE = "inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-700/30 border-slate-600/40";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theater?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const theater = resolveTheater(sp.theater);
  const evt = await getEventDetail(id);
  if (!evt) notFound();

  const et = EVENT_TYPE_STYLES[evt.event_type];
  const cf = CONFIDENCE_STYLES[evt.confidence];

  return (
    <div className="event-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-5xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4">

        {/* Breadcrumb — DS in-content nav (global SiteHeader carries the brand) */}
        <nav className="flex items-center gap-2 text-xs font-data text-slate-500">
          <Link href={`/?theater=${theater.id}`} className="text-slate-400 hover:text-red-400 transition-colors">← Map</Link>
          <span className="text-slate-700">/</span>
          <span className="font-data text-slate-600 truncate">{id.slice(0, 8).toUpperCase()}</span>
        </nav>

        {/* Event header */}
        <Panel padding="sm" className="flex justify-between items-start gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <span className={cn(TOKEN_BADGE, "self-start", et.className)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", et.dot)} />
              {et.label}
            </span>
            <div className="text-[22px] font-bold tracking-[0.04em] uppercase leading-tight text-slate-100">
              {evt.location_name}
              <span className="text-slate-500 mx-2">·</span>
              <span className="text-slate-300">
                {theater.id === "ukraine" ? `${evt.oblast} Oblast` : evt.oblast}
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11px] font-data text-slate-400">{fmtUTC(evt.occurred_at)}</span>
              <span className="text-[11px] font-data text-slate-400">{evt.source_count} source{evt.source_count !== 1 ? "s" : ""}</span>
              {evt.actor && (
                <span className="text-[11px] font-data text-slate-400">Actor: {evt.actor}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-none">
            <span className={cn(TOKEN_BADGE, cf.className)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", cf.dot)} />
              {cf.label}
            </span>
            {evt.human_reviewed_at && (
              <span className="text-[9px] font-data tracking-[0.1em] uppercase text-emerald-500">
                Human reviewed {fmtTime(evt.human_reviewed_at)}
              </span>
            )}
          </div>
        </Panel>

        {/* Body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

          {/* Left column */}
          <div className="flex flex-col gap-4">

            {/* Description */}
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60">
                <span className={SECTION}>Description</span>
              </div>
              <div className="px-4 py-4 text-[13px] text-slate-200 leading-relaxed">
                {evt.description}
              </div>
              {evt.human_reviewer_notes && (
                <div className="mx-4 mb-4 px-3 py-2.5 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-md">
                  <div className="text-[9px] font-data tracking-[0.12em] uppercase text-emerald-500 mb-1">Reviewer note</div>
                  <div className="text-[12px] text-slate-300 leading-relaxed">{evt.human_reviewer_notes}</div>
                </div>
              )}
            </Panel>

            {/* Sources */}
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60 flex justify-between items-baseline">
                <span className={SECTION}>Sources</span>
                <span className={META}>{(evt.event_sources ?? []).length} linked</span>
              </div>
              {(evt.event_sources ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] font-data tracking-[0.08em] uppercase text-slate-600">
                  No sources linked
                </div>
              ) : (
                (evt.event_sources ?? []).map((src: EventSource, i: number) => (
                  <div key={src.id} className="px-4 py-3.5 border-b border-slate-800/60 last:border-b-0 grid grid-cols-[22px_1fr] gap-3 items-start">
                    <span className="text-[10px] font-data text-slate-600 pt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-[12px] font-data text-slate-200 font-medium">{src.display_name}</span>
                        <Badge variant="platform" value={src.platform} />
                        <span className={REL_BADGE}>{src.relationship}</span>
                      </div>
                      <div className="text-[12px] text-slate-400 italic leading-relaxed border-l-2 border-slate-700 pl-2.5 mb-1.5 whitespace-pre-line">
                        &ldquo;{src.text_excerpt}&rdquo;
                      </div>
                      <div className="text-[10px] font-data tracking-[0.06em] uppercase text-slate-600">
                        {fmtUTC(src.posted_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Panel>

            {/* Evidence */}
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60 flex justify-between items-baseline">
                <span className={SECTION}>Evidence</span>
                <span className={META}>{(evt.evidence ?? []).length} items</span>
              </div>
              {(evt.evidence ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] font-data tracking-[0.08em] uppercase text-slate-600">
                  No evidence recorded
                </div>
              ) : (
                (evt.evidence ?? []).map((item: EvidenceItem) => (
                  <div key={item.label} className="px-4 py-3 border-b border-slate-800/60 last:border-b-0 flex flex-col gap-1">
                    <span className="text-[9px] font-data tracking-[0.12em] uppercase text-slate-500">
                      {item.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[12px] text-slate-200 font-medium">{item.label}</span>
                    <span className="text-[11px] text-slate-400 leading-relaxed">{item.notes}</span>
                  </div>
                ))
              )}
            </Panel>

          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Metadata */}
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60">
                <span className={SECTION}>Metadata</span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-3.5">
                {[
                  { label: "Event ID",    value: evt.id.toUpperCase() },
                  { label: "Theater",     value: theater.mapSubtitle },
                  { label: theater.id === "ukraine" ? "Oblast" : "Region", value: evt.oblast },
                  {
                    label: "Coordinates",
                    value: `${Math.abs(evt.lat).toFixed(4)}°${evt.lat >= 0 ? "N" : "S"} ${Math.abs(evt.lng).toFixed(4)}°${evt.lng >= 0 ? "E" : "W"}`,
                  },
                  { label: "Occurred at", value: fmtUTC(evt.occurred_at) },
                  { label: "Actor",       value: evt.actor ?? "Unknown" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-data tracking-[0.14em] uppercase text-slate-500">{label}</span>
                    <span className="text-[12px] font-data text-slate-200 break-all">{value}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Change history */}
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800/60">
                <span className={SECTION}>Change history</span>
              </div>
              {(evt.change_history ?? []).map((entry: ChangeHistoryEntry) => (
                <div key={entry.timestamp} className="px-4 py-2.5 border-b border-slate-800/60 last:border-b-0 grid grid-cols-[auto_1fr] gap-3 items-start">
                  <span className="text-[10px] font-data text-slate-600 whitespace-nowrap pt-px">{fmtTime(entry.timestamp)}</span>
                  <span className="text-[12px] text-slate-400 leading-snug">{entry.change}</span>
                </div>
              ))}
            </Panel>

          </div>
        </div>
      </div>
    </div>
  );
}
