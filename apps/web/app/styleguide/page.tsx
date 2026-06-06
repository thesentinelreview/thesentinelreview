import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import type { FeedPost } from "@/lib/queries";
import Panel from "@/components/ds/Panel";
import Badge from "@/components/ds/Badge";
import FilterChip from "@/components/ds/FilterChip";
import PostCard from "@/components/ds/PostCard";
import {
  CONFIDENCE_STYLES,
  EVENT_TYPE_STYLES,
  PARTNER_BADGE,
  PLATFORM_STYLES,
  RELIABILITY,
  TIER_STYLES,
} from "@/components/ds/tokens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design System — Sentinel Styleguide" };

// ── Layout helpers ───────────────────────────────────────────────────────────
function Section({ title, blurb, children }: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-data tracking-[0.18em] uppercase text-slate-300">{title}</h2>
        {blurb && <p className="text-xs text-slate-500 leading-relaxed">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="font-data text-[11px] text-slate-500">{children}</code>;
}

// ── Illustrative example data ────────────────────────────────────────────────
// These are clearly-labelled placeholder props for demonstrating the PostCard
// primitive only. They are NOT live feed data and are never served publicly
// (this route is admin-gated).
const NOW = "2026-06-06T12:00:00.000Z";

const EXAMPLE_LONG: FeedPost = {
  id:              "00000000-0000-0000-0000-000000000001",
  posted_at:       NOW,
  minutes_ago:     12,
  text:            "Example source post body — illustrative placeholder copy used only to demonstrate the PostCard primitive in the styleguide. It is intentionally long so the line-clamp and Expand / Collapse affordance is visible: lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  translated_text: null,
  lang:            "en",
  source_handle:   "example_source",
  source_display:  "Example Source",
  source_platform: "rss",
  source_url:      "https://example.com/post/1",
  source_trust:    1,
};

const EXAMPLE_TRANSLATED: FeedPost = {
  id:              "00000000-0000-0000-0000-000000000002",
  posted_at:       NOW,
  minutes_ago:     180,
  text:            "Оригінальний текст прикладу — original-language placeholder shown via the translate toggle.",
  translated_text: "Translated example text — shown by default; toggle to reveal the original-language version.",
  lang:            "uk",
  source_handle:   "example_channel",
  source_display:  "Example Channel",
  source_platform: "telegram",
  source_url:      "https://example.com/post/2",
  source_trust:    2,
};

export default async function StyleguidePage() {
  if (!(await isAdmin())) notFound();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-ui">
      <main className="w-full max-w-4xl mx-auto px-6 py-10 flex flex-col gap-12">
        <header className="flex flex-col gap-2 pb-6 border-b border-slate-800/60">
          <h1 className="text-xl font-bold tracking-wide text-slate-100">Sentinel Design System</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Visual reference for the slate dark theme and presentational primitives. Tokens are the
            single source of truth (<Mono>components/ds/tokens.ts</Mono>); full spec in{" "}
            <Mono>apps/web/DESIGN.md</Mono>. Examples below use illustrative placeholder props only.
          </p>
        </header>

        {/* COLORS */}
        <Section title="Surfaces & text" blurb="Page background slate-950; panels use the gradient chrome below.">
          <Panel hover padding="md" className="flex flex-col gap-2">
            <span className="text-sm text-slate-100">Primary text — slate-100</span>
            <span className="text-sm text-slate-300">Secondary text — slate-300</span>
            <span className="text-sm text-slate-400">Muted text — slate-400</span>
            <span className="text-sm text-slate-500">Faint text — slate-500</span>
            <span className="text-sm text-slate-600">Faintest text — slate-600</span>
            <div className="mt-2 pt-2 border-t border-slate-800/60">
              <Mono>border-slate-800/60 — inner divider</Mono>
            </div>
          </Panel>
        </Section>

        {/* FONTS */}
        <Section title="Fonts" blurb="Inter for UI; JetBrains Mono (font-data utility) for data / labels / timestamps.">
          <Panel padding="md" className="flex flex-col gap-3">
            <div className="font-ui text-base text-slate-200">
              Inter — the quick brown fox jumps over the lazy dog 0123456789
            </div>
            <div className="font-data text-base text-slate-200">
              JetBrains Mono (font-data) — the quick brown fox 0123456789
            </div>
          </Panel>
        </Section>

        {/* PANEL */}
        <Section title="Panel" blurb="<Panel hover? padding? as? className>">
          <div className="grid sm:grid-cols-2 gap-4">
            <Panel padding="md"><span className="text-sm text-slate-300">Static · padding=&quot;md&quot;</span></Panel>
            <Panel hover padding="md"><span className="text-sm text-slate-300">Hover · padding=&quot;md&quot;</span></Panel>
            <Panel padding="sm"><span className="text-sm text-slate-300">padding=&quot;sm&quot;</span></Panel>
            <Panel padding="md" className="border-emerald-500/40">
              <span className="text-sm text-slate-300">className override (border)</span>
            </Panel>
          </div>
        </Section>

        {/* BADGE */}
        <Section title="Badge — platform" blurb="Every live platform value plus GDELT. Unknown values fall back to neutral slate (never unstyled).">
          <Row>
            {Object.keys(PLATFORM_STYLES).map((p) => (
              <Badge key={p} variant="platform" value={p} />
            ))}
            <Badge variant="platform" value="unknown-source" />
          </Row>
        </Section>

        <Section title="Badge — tier & partner">
          <Row>
            {(Object.keys(TIER_STYLES) as unknown as Array<keyof typeof TIER_STYLES>).map((t) => (
              <Badge key={t} variant="tier" value={Number(t)} />
            ))}
            <Badge variant="partner" value="Partner" />
            <Mono>{PARTNER_BADGE}</Mono>
          </Row>
        </Section>

        {/* FILTERCHIP */}
        <Section title="FilterChip" blurb="<FilterChip active? onClick? href? > — active vs inactive.">
          <Row>
            <FilterChip active>Active</FilterChip>
            <FilterChip>Inactive</FilterChip>
          </Row>
        </Section>

        {/* RELIABILITY */}
        <Section title="Reliability bar" blurb="≥80 emerald · ≥60 amber · else red, on a slate-800 track.">
          <Panel padding="md" className="flex flex-col gap-3">
            {[88, 72, 41].map((score) => (
              <div key={score} className="flex items-center gap-3">
                <span className="w-10 text-right font-data text-xs text-slate-400">{score}</span>
                <div className={`h-2 flex-1 rounded ${RELIABILITY.track}`}>
                  <div className={`h-2 rounded ${RELIABILITY.barColor(score)}`} style={{ width: `${score}%` }} />
                </div>
              </div>
            ))}
          </Panel>
        </Section>

        {/* DOCUMENT-ONLY SEMANTICS */}
        <Section title="Event-type & confidence (document-only)" blurb="Defined in tokens.ts for future consumers; not yet rendered in the feed.">
          <div className="flex flex-col gap-3">
            <Row>
              {Object.values(EVENT_TYPE_STYLES).map((s) => (
                <span key={s.label} className={`inline-flex items-center px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${s.className}`}>{s.label}</span>
              ))}
            </Row>
            <Row>
              {Object.values(CONFIDENCE_STYLES).map((s) => (
                <span key={s.label} className={`inline-flex items-center px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${s.className}`}>{s.label}</span>
              ))}
            </Row>
          </div>
        </Section>

        {/* POSTCARD */}
        <Section title="PostCard" blurb="Composed from Panel + Badge. Illustrative props only — not live data.">
          <div className="flex flex-col gap-3">
            <PostCard post={EXAMPLE_LONG} watchable isAuthed />
            <PostCard post={EXAMPLE_TRANSLATED} watchable isAuthed initialWatched confirmed eventId="00000000-0000-0000-0000-000000000002" />
            <PostCard post={EXAMPLE_LONG} watchable isAuthed={false} />
          </div>
        </Section>
      </main>
    </div>
  );
}
