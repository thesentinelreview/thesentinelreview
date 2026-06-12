# Sentinel Design System

The reusable presentational layer for the dashboard. Primitives live in
`apps/web/components/ds/`; their colours come from one source of truth,
`apps/web/components/ds/tokens.ts`. The first consumer is `/app/feed`.

> **Reskinning a page = composing it from these primitives.** No Figma
> round-trips. When you reskin page X, build any missing primitive it needs
> (see the roadmap at the bottom) rather than inlining one-off markup.

Stack: Next.js 16 + React 19 + Tailwind v4 (`@theme` in `app/globals.css`, **no
`tailwind.config.ts`**). The palette is standardised on **slate** — do not
introduce new `zinc-*` in design-system code.

---

## Tokens

| Token | Value |
|---|---|
| Page background | `bg-slate-950` |
| Page gutter | `--gutter: 1.25rem` → `px-(--gutter)` (full-bleed shell horizontal gutter; see `<PageShell>`) |
| Prose measure | `--container-measure: 72ch` → `max-w-measure` (readable cap for long-form body copy) |
| Panel chrome | `bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl shadow-xl` |
| Panel hover | `hover:border-slate-600 transition-all` |
| Inner dividers / borders | `border-slate-800/60` |
| Text — primary / secondary / muted / faint | `slate-100` / `slate-300` / `slate-400` / `slate-500` (faintest `slate-600`–`slate-700`) |
| Tier colors | 1 = emerald · 2 = amber · 3 = slate |
| Partner badge | `bg-red-500/15 border-red-500/30 text-red-400` |
| Reliability bar | ≥80 emerald · ≥60 amber · else red; track `bg-slate-800` |
| Event-type semantics (document only) | strike = red · clash = amber · movement = cyan |
| Confidence semantics (document only) | verified = emerald · partial = amber · unconfirmed = slate |

### Platform badge colours (exact)

| Platform | Classes |
|---|---|
| RSS | `text-emerald-400 bg-emerald-500/10 border-emerald-500/30` |
| X | `text-sky-400 bg-sky-500/10 border-sky-500/30` |
| Telegram | `text-blue-400 bg-blue-500/10 border-blue-500/30` |
| Bluesky | `text-cyan-400 bg-cyan-500/10 border-cyan-500/30` |
| GDELT | `text-amber-400 bg-amber-500/10 border-amber-500/30` |
| Wire | `text-violet-400 bg-violet-500/10 border-violet-500/30` *(placeholder — not in the Figma export; change in `tokens.ts` only)* |

### Tier badge colours (exact)

| Tier | Classes |
|---|---|
| 1 | `text-emerald-400 bg-emerald-500/10 border-emerald-500/30` |
| 2 | `text-amber-400 bg-amber-500/10 border-amber-500/30` |
| 3 | `text-slate-400 bg-slate-700/30 border-slate-600/40` |

All of the above are exported from `tokens.ts` as `PLATFORM_STYLES`,
`PLATFORM_FALLBACK` / `platformStyle()`, `TIER_STYLES` / `tierStyle()`,
`PARTNER_BADGE`, `RELIABILITY`, `EVENT_TYPE_STYLES`, `CONFIDENCE_STYLES`, and the
panel constants `PANEL_BASE` / `PANEL_HOVER`. **Never copy these strings into a
component — import them.**

## Fonts

- **UI:** Inter → `font-ui` utility.
- **Data / labels / timestamps:** JetBrains Mono → **`font-data` utility**.

> ⚠️ Repo gotcha: in this project's Tailwind v4 `@theme`, the JetBrains Mono
> face is the `font-data` utility. `font-mono` maps to **IBM Plex Mono** (a
> different family used by the legacy public pages). Use `font-data` for the
> mono look this design system specifies.

## The `cn()` helper

`apps/web/lib/cn.ts` — `clsx` + `tailwind-merge`. The only class-merge helper in
the app; every primitive routes `className` through it so a caller's class can
override a base utility (`cn("p-6", "p-4") → "p-4"`).

---

## Primitives

All are presentational: props in, no data fetching, no mock arrays. Import from
`@/components/ds`.

### `<Panel>`
The canonical panel chrome.

```tsx
<Panel hover padding="md">…</Panel>
```

| Prop | Type | Notes |
|---|---|---|
| `hover` | `boolean` | adds `hover:border-slate-600 transition-all` |
| `padding` | `'sm' \| 'md'` | `sm` → `p-5`, `md` → `p-6`; omit for a flush panel |
| `as` | `ElementType` | element to render (default `div`) |
| `className` | `string` | merged via `cn()` |

### `<Badge>`
Small categorical label. Colours resolve from `tokens.ts`; an unknown platform
falls back to neutral slate (never unstyled). Base:
`px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider`.

```tsx
<Badge variant="platform" value="telegram" />
<Badge variant="tier" value={1} />
<Badge variant="partner" value="Partner" />
```

| Prop | Type | Notes |
|---|---|---|
| `variant` | `'platform' \| 'tier' \| 'partner'` | |
| `value` | `string \| number` | platform enum · `1 \| 2 \| 3` · partner label |
| `className` | `string` | |

### `<FilterChip>`
Toggle pill for filter rows. Parent owns filter state. Pass `href` for
URL-driven filters (the feed's server model) **or** `onClick` for client toggles.
Active `bg-slate-700 border-slate-500 text-slate-100`; inactive
`bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600`.

```tsx
<FilterChip href="/app/feed?platforms=rss" active>RSS</FilterChip>
<FilterChip onClick={toggle} active={on}>Tier 1</FilterChip>
```

| Prop | Type | Notes |
|---|---|---|
| `active` | `boolean` | |
| `href` | `string` | renders a Next `<Link>` (server-safe) |
| `onClick` | `() => void` | client-side toggle |
| `children` | `ReactNode` | |

### `<PostCard>`
Raw source-post card; container is `<Panel hover padding="sm">`. Composed from
`Panel` + `Badge`. Every field is passed in by the page. The only network call
is the watch toggle (preserves the `/api/watches` POST/DELETE contract).

```tsx
<PostCard post={post} watchable isAuthed initialWatched={watched}
          confirmed={info?.confirmed} eventId={info?.event_id} />
```

| Prop | Type | Notes |
|---|---|---|
| `post` | `FeedPost` | real feed row |
| `watchable` | `boolean` | render the live-only watch control |
| `isAuthed` | `boolean` | unauth → "Watch" links to `/sign-in` |
| `initialWatched` | `boolean` | |
| `confirmed` | `boolean` | linked to a published event |
| `eventId` | `string \| null` | target of the "Confirmed by Sentinel" link |

Includes the live-only items the Figma export omitted: platform + tier badges,
relative timestamp (absolute on hover), `line-clamp-3` body with Expand/Collapse,
"View source" link, translate toggle (Eye/EyeOff — shown only when an
original-language version exists), the auth-gated Watch button, and the
"Confirmed by Sentinel" link to the event detail.

### `<KpiTile>`
Stat tile on the canonical `<Panel>` chrome: uppercase `font-data` label, big
slate-100 value, optional unit / delta (emerald/red) / hint line. Prop shape
mirrors the watchfloor's bespoke `Kpi` so that rail can adopt this tile when it
is reskinned. Consumers: `/admin/tieout`.

```tsx
<KpiTile label="Total events" value={42} hint="published, in theater bbox" />
<KpiTile label="Fusion" value={87} unit="%" delta="+4" deltaColor="green" />
```

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` | uppercase `font-data` slate-500 |
| `value` | `string \| number` | big slate-100, `tabular-nums` |
| `unit` | `string` | small suffix beside the value |
| `delta` | `string` | optional change figure |
| `deltaColor` | `'red' \| 'green'` | delta tint (default green/emerald) |
| `hint` | `string` | one-line `font-data` slate-600 footnote |

### `<PageShell>`
The canonical full-bleed page column: full width (no `max-w-*` / `mx-auto`) with the
standard page gutter (`px-(--gutter)`) and vertical rhythm (`py-6 pb-20`, default
`gap-4`). The single source of truth for the content-page shell so routes share
identical left/right edges. Consumers: `/sources`, `/app/feed`, `/methodology`.

```tsx
<PageShell>…</PageShell>
<PageShell as="main" className="flex-1">…</PageShell>
```

| Prop | Type | Notes |
|---|---|---|
| `as` | `ElementType` | element to render (default `div`); e.g. `"main"` |
| `className` | `string` | merged via `cn()` (override `gap-*`, add `flex-1`, …) |

**Prose-measure rule:** the shell is full-width, but long-form running body copy
should be capped with `max-w-measure` (`--container-measure`, ~72ch) so text stays
readable. Section headers and card grids may span the full width — only the body
copy gets the cap (see `/methodology`).

---

## How to reskin a page to the design system

1. **Keep data fetching as-is.** Don't touch `lib/queries.ts`, `/api/*`, or the
   route's existing data function. Reskins swap presentation only.
2. **Wrap section containers in `<Panel>`** where a bordered surface is
   appropriate (controls, cards, empty states). Lightweight prose/labels can
   stay as plain blocks.
3. **Replace bespoke chips with `<FilterChip>`** and bespoke labels with
   `<Badge>`. Preserve the existing filter mechanism — for URL-driven filters
   pass `href`, not `onClick`.
4. **Replace card markup with the relevant card primitive** (e.g. `<PostCard>`),
   fed by real rows.
5. **Use tokens, not literals** — page background `bg-slate-950`, `font-data`
   for mono, colours via the `tokens.ts` maps.
6. **Preserve every behavior** — auth gating, pagination, toggles, links.
7. If the page needs a primitive that doesn't exist yet, build it in
   `components/ds/` (props in, no data) and add it here.

---

## Primitives roadmap

Not yet extracted — build each when its first consumer is reskinned. Until then
the watchfloor (`/`) keeps its current bespoke components.

| Primitive | Spec | First consumer |
|---|---|---|
| `BriefingPane` | Titled scrollable pane for the daily briefing: header (tag + title + meta), paragraph body, "reviewed" state. | watchfloor brief pane, `/briefing/[id]` |
| `ReliabilityBar` | Thin track + fill using `RELIABILITY` thresholds; `score` prop. (Tokens exist; component pending.) | source tables |
| `SourceRow` | Ranked source row: handle + platform `<Badge>` + reliability bar + counts. | `/sources`, TopSources |
| `EventBadge` | Badge for `event_type` / `confidence` using `EVENT_TYPE_STYLES` / `CONFIDENCE_STYLES` (currently document-only). | event detail, map popups |
| `SectionHeader` | Day-group / section header: label + count, `border-slate-800/60` divider. | feed day groups, lists |

When you build one: presentational only, colours from `tokens.ts`, document its
prop signature + a one-line example above, and move its row out of this table.
