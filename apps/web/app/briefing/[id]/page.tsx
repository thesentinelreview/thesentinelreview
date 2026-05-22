import Link from "next/link";
import { notFound } from "next/navigation";
import SiteNav from "@/components/SiteNav";
import { getFullBriefing, getEventDetail } from "@/lib/queries";
import { resolveTheater } from "@/data/theaters";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

function dotClass(type: string, s: Record<string, string>): string {
  if (type === "strike") return s.dotStrike;
  if (type === "clash") return s.dotClash;
  return s.dotMovement;
}

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
    <div className={s.page}>
      <SiteNav />

      <div className={s.breadcrumb}>
        <Link href="/">← Map</Link>
        <span>/</span>
        <span>Briefings</span>
        <span>/</span>
        <span>{id}</span>
      </div>

      <div className={s.header}>
        <div className={s.headerTop}>
          <div className={s.title}>{theater.briefingTitle}</div>
          <div className={s.actions}>
            <span className={s.badge}>{brief.reviewed ? "Reviewed" : "AI Draft"}</span>
            <span className={`${s.badge} ${s.badgeAction}`}>Embed ↗</span>
          </div>
        </div>
        <div className={s.byline}>
          <span>{brief.date}</span>
          <span>{brief.utc_time}</span>
          <span>Compiled from {brief.source_count} sources</span>
        </div>
      </div>

      <div className={s.body}>

        {/* Briefing text */}
        <div className={s.briefingPanel}>
          <div className={s.briefingInner}>
            {brief.full_paragraphs.map((p, i) => (
              <p key={i} className={s.briefingP}>{p}</p>
            ))}

            <div className={s.embedCode}>
              <div className={s.embedLabel}>Embed this briefing</div>
              <textarea
                className={s.embedInput}
                readOnly
                rows={3}
                defaultValue={embedIframe}
              />
            </div>
          </div>
        </div>

        {/* Right rail */}
        <div>

          {/* Confidence summary */}
          <div className={s.panel} style={{ marginBottom: 14 }}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Confidence breakdown</div>
              <div className={s.panelMeta}>this briefing</div>
            </div>
            <div className={s.confGrid}>
              <div className={s.confRow}>
                <span className={`${s.confDot} ${s.confDotVerified}`} />
                <span className={s.confLabel}>Verified</span>
                <span className={s.confCount}>{brief.confidence_summary.verified}</span>
              </div>
              <div className={s.confRow}>
                <span className={`${s.confDot} ${s.confDotPartial}`} />
                <span className={s.confLabel}>Partial</span>
                <span className={s.confCount}>{brief.confidence_summary.partial}</span>
              </div>
              <div className={s.confRow}>
                <span className={`${s.confDot} ${s.confDotUnconf}`} />
                <span className={s.confLabel}>Unconfirmed</span>
                <span className={s.confCount}>{brief.confidence_summary.unconfirmed}</span>
              </div>
            </div>
          </div>

          {/* Referenced events */}
          <div className={s.panel}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>Referenced events</div>
              <div className={s.panelMeta}>{referencedEvents.length}</div>
            </div>
            <div className={s.eventList}>
              {referencedEvents.map((evt) => (
                <Link key={evt.id} href={`/event/${evt.id}`} className={s.eventRow}>
                  <span className={`${s.eventDot} ${dotClass(evt.event_type, s)}`} />
                  <span className={s.eventRowName}>{evt.location_name}</span>
                  <span className={s.eventRowId}>{evt.id.slice(0, 8).toUpperCase()}</span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
