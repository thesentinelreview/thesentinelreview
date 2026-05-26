import Link from "next/link";
import { notFound } from "next/navigation";
import SentinelMark from "@/components/watchfloor/SentinelMark";
import type { EventSource, EvidenceItem, ChangeHistoryEntry } from "@/lib/types";
import { resolveTheater } from "@/data/theaters";
import { getEventDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function platformLabel(p: string): string {
  if (p === "x")        return "X";
  if (p === "telegram") return "TG";
  if (p === "rss")      return "RSS";
  if (p === "bluesky")  return "BSky";
  return "WIRE";
}

function platformColor(p: string): string {
  if (p === "x")        return "text-zinc-400 border-zinc-700";
  if (p === "telegram") return "text-sky-400 border-sky-800";
  if (p === "rss")      return "text-amber-400 border-amber-800";
  if (p === "bluesky")  return "text-blue-400 border-blue-800";
  return "text-emerald-400 border-emerald-800";
}

function relColor(r: string): string {
  if (r === "primary")       return "text-blue-400 border-blue-800 bg-blue-500/10";
  if (r === "corroborating") return "text-emerald-400 border-emerald-800 bg-emerald-500/10";
  return "text-red-400 border-red-800 bg-red-500/10";
}

function typeStyle(t: string): string {
  if (t === "strike")   return "text-red-400 border-red-500/40 bg-red-500/[0.08]";
  if (t === "clash")    return "text-amber-400 border-amber-500/40 bg-amber-500/[0.08]";
  return "text-cyan-400 border-cyan-500/40 bg-cyan-500/[0.08]";
}

function confStyle(c: string): string {
  if (c === "verified") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/[0.06]";
  if (c === "partial")  return "text-amber-400 border-amber-500/40 bg-amber-500/[0.06]";
  return "text-zinc-400 border-zinc-700 bg-transparent";
}

function confLabel(c: string): string {
  if (c === "verified") return "● Verified";
  if (c === "partial")  return "◐ Partial";
  return "○ Unconfirmed";
}

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

  const CHIP = "px-2 py-0.5 text-[9px] font-data tracking-[0.14em] uppercase rounded-sm border";

  return (
    <div className="event-root min-h-screen flex flex-col bg-[#05070A] text-zinc-100 font-ui">

      {/* TOP BAR */}
      <header className="bg-zinc-950/80 border-b border-zinc-900 px-5 py-3 flex items-center gap-3 flex-none">
        <SentinelMark
          className="flex-none text-[#D99A00] drop-shadow-[0_0_4px_rgba(217,154,0,0.28)] transition-[color,filter] hover:text-[#F2B705] hover:drop-shadow-[0_0_6px_rgba(242,183,5,0.35)]"
          size={24}
        />
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/?theater=${theater.id}`} className="text-[15px] font-bold tracking-[0.25em] uppercase text-white/70 hover:text-white whitespace-nowrap">
            Sentinel Review
          </Link>
          <span className="text-zinc-700">/</span>
          <Link href={`/?theater=${theater.id}`} className="text-[12px] tracking-[0.18em] uppercase text-zinc-400 hover:text-zinc-200 whitespace-nowrap">
            Map
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-[12px] tracking-[0.18em] uppercase text-amber-400/80 whitespace-nowrap truncate">
            {id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </header>

      {/* CONTENT */}
      <div className="w-full max-w-5xl mx-auto px-5 py-6 pb-20 flex flex-col gap-4 flex-1">

        {/* Event header */}
        <div className="border border-zinc-900 bg-zinc-950/60 rounded-sm p-5 flex justify-between items-start gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <span className={`self-start ${CHIP} ${typeStyle(evt.event_type)}`}>
              {evt.event_type}
            </span>
            <div className="text-[22px] font-bold tracking-[0.04em] uppercase leading-tight">
              {evt.location_name}
              <span className="text-zinc-500 mx-2">·</span>
              <span className="text-zinc-300">
                {theater.id === "ukraine" ? `${evt.oblast} Oblast` : evt.oblast}
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[11px] font-data text-zinc-400">{fmtUTC(evt.occurred_at)}</span>
              <span className="text-[11px] font-data text-zinc-400">{evt.source_count} source{evt.source_count !== 1 ? "s" : ""}</span>
              {evt.actor && (
                <span className="text-[11px] font-data text-zinc-400">Actor: {evt.actor}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-none">
            <span className={`${CHIP} ${confStyle(evt.confidence)}`}>
              {confLabel(evt.confidence)}
            </span>
            {evt.human_reviewed_at && (
              <span className="text-[9px] font-data tracking-[0.1em] uppercase text-emerald-500">
                Human reviewed {fmtTime(evt.human_reviewed_at)}
              </span>
            )}
          </div>
        </div>

        {/* Body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

          {/* Left column */}
          <div className="flex flex-col gap-4">

            {/* Description */}
            <section className="border border-zinc-900 bg-zinc-950/60 rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-900">
                <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400">Description</span>
              </div>
              <div className="px-4 py-4 text-[13px] text-zinc-200 leading-relaxed">
                {evt.description}
              </div>
              {evt.human_reviewer_notes && (
                <div className="mx-4 mb-4 px-3 py-2.5 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-sm">
                  <div className="text-[9px] font-data tracking-[0.12em] uppercase text-emerald-500 mb-1">Reviewer note</div>
                  <div className="text-[12px] text-zinc-300 leading-relaxed">{evt.human_reviewer_notes}</div>
                </div>
              )}
            </section>

            {/* Sources */}
            <section className="border border-zinc-900 bg-zinc-950/60 rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-900 flex justify-between items-baseline">
                <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400">Sources</span>
                <span className="text-[10px] font-data tracking-[0.08em] uppercase text-zinc-500">
                  {(evt.event_sources ?? []).length} linked
                </span>
              </div>
              {(evt.event_sources ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] font-data tracking-[0.08em] uppercase text-zinc-600">
                  No sources linked
                </div>
              ) : (
                (evt.event_sources ?? []).map((src: EventSource, i: number) => (
                  <div key={src.id} className="px-4 py-3.5 border-b border-zinc-900 last:border-b-0 grid grid-cols-[22px_1fr] gap-3 items-start">
                    <span className="text-[10px] font-data text-zinc-600 pt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-[12px] font-data text-zinc-200 font-medium">{src.display_name}</span>
                        <span className={`${CHIP} ${platformColor(src.platform)}`}>
                          {platformLabel(src.platform)}
                        </span>
                        <span className={`${CHIP} ${relColor(src.relationship)}`}>
                          {src.relationship}
                        </span>
                      </div>
                      <div className="text-[12px] text-zinc-400 italic leading-relaxed border-l-2 border-zinc-800 pl-2.5 mb-1.5">
                        &ldquo;{src.text_excerpt}&rdquo;
                      </div>
                      <div className="text-[10px] font-data tracking-[0.06em] uppercase text-zinc-600">
                        {fmtUTC(src.posted_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Evidence */}
            <section className="border border-zinc-900 bg-zinc-950/60 rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-900 flex justify-between items-baseline">
                <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400">Evidence</span>
                <span className="text-[10px] font-data tracking-[0.08em] uppercase text-zinc-500">
                  {(evt.evidence ?? []).length} items
                </span>
              </div>
              {(evt.evidence ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-[11px] font-data tracking-[0.08em] uppercase text-zinc-600">
                  No evidence recorded
                </div>
              ) : (
                (evt.evidence ?? []).map((item: EvidenceItem) => (
                  <div key={item.label} className="px-4 py-3 border-b border-zinc-900 last:border-b-0 flex flex-col gap-1">
                    <span className="text-[9px] font-data tracking-[0.12em] uppercase text-zinc-500">
                      {item.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[12px] text-zinc-200 font-medium">{item.label}</span>
                    <span className="text-[11px] text-zinc-400 leading-relaxed">{item.notes}</span>
                  </div>
                ))
              )}
            </section>

          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Metadata */}
            <section className="border border-zinc-900 bg-zinc-950/60 rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-900">
                <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400">Metadata</span>
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
                    <span className="text-[9px] font-data tracking-[0.14em] uppercase text-zinc-500">{label}</span>
                    <span className="text-[12px] font-data text-zinc-200 break-all">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Change history */}
            <section className="border border-zinc-900 bg-zinc-950/60 rounded-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-900">
                <span className="text-[10px] font-data tracking-[0.18em] uppercase text-zinc-400">Change history</span>
              </div>
              {(evt.change_history ?? []).map((entry: ChangeHistoryEntry) => (
                <div key={entry.timestamp} className="px-4 py-2.5 border-b border-zinc-900 last:border-b-0 grid grid-cols-[auto_1fr] gap-3 items-start">
                  <span className="text-[10px] font-data text-zinc-600 whitespace-nowrap pt-px">{fmtTime(entry.timestamp)}</span>
                  <span className="text-[12px] text-zinc-400 leading-snug">{entry.change}</span>
                </div>
              ))}
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
