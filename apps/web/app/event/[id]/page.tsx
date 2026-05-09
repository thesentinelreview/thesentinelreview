import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import type { EventSource, EvidenceItem, ChangeHistoryEntry } from "@/data/placeholder";
import { getEventDetail } from "@/lib/queries";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

function platformLabel(p: string): string {
  if (p === "x") return "X";
  if (p === "telegram") return "TG";
  if (p === "rss") return "RSS";
  return "WIRE";
}

function platformClass(p: string, s: Record<string, string>): string {
  if (p === "x") return s.platX;
  if (p === "telegram") return s.platTelegram;
  if (p === "rss") return s.platRss;
  return s.platWire;
}

function relClass(r: string, s: Record<string, string>): string {
  if (r === "primary") return s.relPrimary;
  if (r === "corroborating") return s.relCorroborating;
  return s.relContradicting;
}

function typeClass(t: string, s: Record<string, string>): string {
  if (t === "strike") return s.typeStrike;
  if (t === "clash") return s.typeClash;
  return s.typeMovement;
}

function confClass(c: string, s: Record<string, string>): string {
  if (c === "verified") return s.confVerified;
  if (c === "partial") return s.confPartial;
  return s.confUnconfirmed;
}

function confLabel(c: string): string {
  if (c === "verified") return "● Verified";
  if (c === "partial") return "◐ Partial";
  return "○ Unconfirmed";
}

function evidenceTypeLabel(t: EvidenceItem["type"]): string {
  if (t === "geolocation") return "Geolocation";
  if (t === "screenshot") return "Screenshot";
  if (t === "official_statement") return "Official statement";
  return "Wire report";
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evt = await getEventDetail(id);
  if (!evt) notFound();

  return (
    <div className={s.page}>
      <SiteNav />

      <div className={s.breadcrumb}>
        <Link href="/">← Map</Link>
        <span>/</span>
        <span>Events</span>
        <span>/</span>
        <span>{id.toUpperCase()}</span>
      </div>

      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={`${s.typeBadge} ${typeClass(evt.event_type, s)}`}>
            {evt.event_type}
          </div>
          <div className={s.eventTitle}>
            {evt.location_name} · {evt.oblast} Oblast
          </div>
          <div className={s.eventMeta}>
            <span>{fmtUTC(evt.occurred_at)}</span>
            <span>{evt.source_count} source{evt.source_count !== 1 ? "s" : ""}</span>
            {evt.actor && <span>Actor: {evt.actor}</span>}
          </div>
        </div>
        <div className={s.headerRight}>
          <div className={`${s.confidenceBadge} ${confClass(evt.confidence, s)}`}>
            {confLabel(evt.confidence)}
          </div>
          {evt.human_reviewed_at && (
            <div className={s.reviewNote}>
              Human reviewed {fmtTime(evt.human_reviewed_at)}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={s.body}>

        {/* Left column */}
        <div className={s.left}>

          {/* Description */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Description</div>
            </div>
            <div className={s.description}>{evt.description}</div>
            {evt.human_reviewer_notes && (
              <div className={s.reviewerNote}>
                <div className={s.reviewerNoteLabel}>Reviewer note</div>
                <div className={s.reviewerNoteText}>{evt.human_reviewer_notes}</div>
              </div>
            )}
          </div>

          {/* Sources */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Sources</div>
              <div className={s.panelMeta}>{evt.event_sources.length} linked</div>
            </div>
            {evt.event_sources.length === 0 ? (
              <div className={s.empty}>No sources linked</div>
            ) : (
              evt.event_sources.map((src: EventSource, i: number) => (
                <div key={src.id} className={s.sourceItem}>
                  <div className={s.sourceNum}>{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <div className={s.sourceHeader}>
                      <span className={s.sourceHandle}>{src.display_name}</span>
                      <span className={`${s.platformBadge} ${platformClass(src.platform, s)}`}>
                        {platformLabel(src.platform)}
                      </span>
                      <span className={`${s.relBadge} ${relClass(src.relationship, s)}`}>
                        {src.relationship}
                      </span>
                    </div>
                    <div className={s.sourceExcerpt}>&ldquo;{src.text_excerpt}&rdquo;</div>
                    <div className={s.sourceTime}>{fmtUTC(src.posted_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right column */}
        <div className={s.right}>

          {/* Metadata */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Metadata</div>
            </div>
            <div className={s.metaGrid}>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Event ID</div>
                <div className={s.metaValue}>{evt.id.toUpperCase()}</div>
              </div>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Theater</div>
                <div className={s.metaValue}>Ukraine — Eastern</div>
              </div>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Oblast</div>
                <div className={s.metaValue}>{evt.oblast}</div>
              </div>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Coordinates</div>
                <div className={s.metaValue}>{evt.lat.toFixed(4)}°N {evt.lng.toFixed(4)}°E</div>
              </div>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Occurred at</div>
                <div className={s.metaValue}>{fmtUTC(evt.occurred_at)}</div>
              </div>
              <div className={s.metaRow}>
                <div className={s.metaLabel}>Actor</div>
                <div className={s.metaValue}>{evt.actor ?? "Unknown"}</div>
              </div>
            </div>
          </div>

          {/* Evidence */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Evidence</div>
              <div className={s.panelMeta}>{evt.evidence.length} items</div>
            </div>
            {evt.evidence.length === 0 ? (
              <div className={s.empty}>No evidence recorded</div>
            ) : (
              evt.evidence.map((item: EvidenceItem, i: number) => (
                <div key={i} className={s.evidenceItem}>
                  <div className={s.evidenceType}>{evidenceTypeLabel(item.type)}</div>
                  <div className={s.evidenceLabel}>{item.label}</div>
                  <div className={s.evidenceNotes}>{item.notes}</div>
                </div>
              ))
            )}
          </div>

          {/* Change history */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Change history</div>
            </div>
            {evt.change_history.map((entry: ChangeHistoryEntry, i: number) => (
              <div key={i} className={s.historyItem}>
                <div className={s.historyTime}>{fmtTime(entry.timestamp)}</div>
                <div className={s.historyChange}>{entry.change}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
