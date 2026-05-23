# Sentinel Review — Dashboard State & Functionality Handoff
*As of 2026-05-23. For use in Claude Chat brainstorming.*

---

## What It Is

The Sentinel Review is a conflict-intelligence dashboard at **dashboard.thesentinelreview.com**. It ingests OSINT posts from 53 sources every 30 minutes, runs LLM extraction to turn raw posts into structured conflict events, and presents them on a live map and feed. The audience is paying subscribers who need real-time situational awareness on active conflict theaters.

**Stack:** Next.js (App Router) on Cloudflare Pages + Vercel, PostgreSQL (Supabase/Neon), Python ingest pipeline on GitHub Actions, Anthropic API for LLM extraction, Clerk for auth, Stripe for billing, MapLibre for the map.

---

## The Four Theaters

Each theater has a bounding box used to spatially filter all queries. No theater column on sources — everything is resolved by geocoordinate.

| Theater | Bounding Box | Focus |
|---|---|---|
| **Ukraine** | 22–40°E, 44–52°N | Donetsk/Luhansk front, cross-border strikes |
| **Iran** | 32–64°E, 10–42°N | Nuclear sites, IRGC, Israel-Iran, proxy activity |
| **Sudan** | 21–42°E, 8–23°N | SAF vs RSF civil war, Darfur, Khartoum |
| **Myanmar** | 92–102°E, 9–29°N | Junta vs PDF and EAOs |

---

## Data Model (key tables)

- **`events`** — geolocated conflict events. Fields: `id`, `event_type` (strike/clash/movement), `occurred_at`, `location` (PostGIS), `location_name`, `oblast`, `actor`, `description`, `confidence` (verified/partial/unconfirmed), `published_at` (null = draft), `human_reviewed_at`, `human_reviewer_notes`
- **`sources`** — the 53 OSINT sources. Fields: `handle`, `display_name`, `platform` (telegram/rss/x/wire/bluesky), `trust_tier` (1/2/3), `is_active`, `url`, `notes`
- **`raw_posts`** — raw ingested text posts before LLM extraction. Fields: `id`, `text`, `translated_text`, `lang`, `posted_at`, `source_id`
- **`event_sources`** — many-to-many join between events and raw_posts/sources. Fields: `event_id`, `source_id`, `raw_post_id`, `relationship` (primary/corroborating/contradicting)
- **`source_reliability`** — materialized stats per source: `verified_rate_30d`, `events_30d`, `last_event_at`
- **`briefings`** — AI-generated daily briefings. Fields: `id`, `theater`, `draft_text`, `published_text`, `status` (draft/published), `event_ids[]`, `published_at`
- **`watches`** — per-user watched raw posts (Clerk user ID + raw_post_id)

---

## Pages & Routes

### `/` — Watchfloor (Main Dashboard)
The primary product page. Full-screen dark-UI layout, no scroll on desktop.

**Components:**
- **HeaderBar** — top bar with SentinelMark logo, theater dropdown (Ukraine/Iran/Sudan/Myanmar), time window toggle (24H/7D), link to Source Feed
- **SensorStrip** — decorative strip showing sensor type chips (EO, IR, SAR, SIGINT, RF, ELINT, ACOUSTIC) — currently cosmetic/static
- **KpiRail** — 7 KPI chips: `{window} Events` (with ±% vs 7d avg), `Strikes`, `Contacts` (stub), `Movements` (stub), `Verified %`, `Median TTV` (stub), `Fusion` (stub)
- **Map** (MapLibre) — geolocated event dots, color-coded by type (red=strike, amber=clash, cyan=movement), clickable popups linking to event detail. Filterable by event type via legend. Center/zoom persisted in URL params.
- **MapLegend** — event type toggle links (Strike/Contact/Movement)
- **BriefPane** — left panel: latest AI briefing preview (2 paragraphs) + top 5 sources for the theater by today's event count
- **LiveStream** — up to 4 latest alerts from the selected theater/window
- **SectorThreat** — 7-day intensity bar chart + "No sector data available" placeholder for sector-level breakdown
- **TimeScrubber** — bottom bar, currently cosmetic

**URL params:** `?theater=ukraine&window=24h&types=strike,clash,movement&lat=&lng=&zoom=`

**Auth:** Works for anonymous users. Clerk session used only to gate the Source Feed.

---

### `/app/feed` — Source Feed (Subscriber-gated)
Raw post feed showing the unprocessed OSINT firehose, scoped to the selected theater by bbox.

**Features:**
- Theater selector (same 4 theaters)
- Filter chips by platform (Telegram/RSS/X/Wire/Bluesky) and trust tier (1/2/3)
- Paginated 30-posts-per-page with cursor-based "Load more"
- Posts grouped by day
- Each PostCard shows: source display name, platform badge, tier badge, timestamp (relative + absolute on hover), post body, translation toggle (if non-English), Watch button (auth-required), "Confirmed by Sentinel" badge + link to event detail if the post has been linked to a published event
- Unauthenticated users see a sign-in prompt instead of Watch

**Requires Clerk auth** to access the page (redirects to `/sign-in`).

---

### `/event/[id]` — Event Detail
Per-event deep-dive page.

**Sections:**
- Header: event type badge, location + oblast, timestamp, source count, actor, confidence badge, human-review timestamp
- Description panel
- Sources panel: ordered list of linked raw posts with platform badge, relationship badge (primary/corroborating/contradicting), text excerpt, timestamp
- Evidence panel: currently always empty (pipeline doesn't yet populate this)
- Metadata panel: event ID, theater, oblast/region, coordinates, occurred_at, actor
- Change history panel: auto-generated entries for event creation and human review

**Design:** Dark edge-to-edge watchfloor aesthetic (matching the rest of the app), amber breadcrumb, JetBrains Mono labels, flat zinc panels.

---

### `/sources` — Source Reliability
Public table of all 53 active sources (all theaters shown together).

**Columns:** Rank, Source (display name + platform badge + trust tier badge), Today (events in last 24h), 30-day events, Verified rate (progress bar + %), Last seen

**Ranked** by 30-day event count descending.

---

### `/theaters` and `/theaters/[theater]`
Marketing/context pages for each theater. Static content with tagline, background paragraphs, key actors. Not behind auth.

---

### `/briefing/[id]`
Full briefing page. Shows all paragraphs of an AI briefing, referenced event count broken out by confidence level, and source count.

---

### `/methodology`, `/about`, `/pricing`
Static/marketing pages.

---

### `/sign-in`, `/sign-up`
Clerk-hosted auth pages.

---

## Ingest Pipeline (GitHub Actions, every 30 min)

1. **Fetch** — RSS, Telegram, X, and Bluesky ingestors pull new posts and write to `raw_posts`
2. **Extract** — LLM (Anthropic) reads batches of raw posts and extracts structured conflict events (type, location, actor, confidence, description) → writes to `events` + `event_sources`
3. **Dedup** — merges near-duplicate events
4. **Score** — updates confidence based on cross-source corroboration
5. **Briefing** — generates a daily AI briefing per theater → writes to `briefings`
6. **Integrity checks** — `checks.py` runs assertions; critical failures post to Slack webhook and exit 1

**Source trust tiers:** 1 = high trust (primary source, e.g. verified government/military channels), 2 = medium trust, 3 = low trust (high-volume, noisy).

---

## What's Working Well

- Full data pipeline (ingest → extract → publish) running every 30 min
- Multi-theater support across 4 conflict zones
- Source feed with platform/tier filtering and post-level watch functionality
- Event detail with source attribution and relationship tagging
- AI briefings (draft + published states)
- Confidence scoring (verified/partial/unconfirmed)
- Source reliability stats (30-day rolling)
- Clerk auth + Stripe billing wired up
- Dark watchfloor UI consistent across map, feed, event detail, sources pages

## Known Gaps / Stubs

- **SensorStrip** — cosmetic, no real sensor data
- **SectorThreat** sector breakdown — shows "No sector data available"; only intensity bars are real
- **Contacts / Movements / Median TTV / Fusion KPIs** — show `—`, not yet populated
- **Evidence items** on event detail — pipeline doesn't populate `EvidenceItem` yet
- **TimeScrubber** — cosmetic, no historical playback
- **Sources page is theater-unaware** — shows all 53 sources regardless of selected theater
- **Embed routes** (`/embed/map`, `/embed/briefing/[id]`) exist but are lightly used

---

## Design System

- **Background:** `#05070A` (page) / `#0c0d10` (body)
- **Surfaces:** `bg-zinc-950/60`, `border-zinc-900`
- **Text:** zinc-100 primary, zinc-400 secondary, zinc-500 tertiary
- **Accent:** amber-400/amber-500 (active states, breadcrumbs, SentinelMark)
- **Event colors:** red = strike, amber = clash, cyan = movement
- **Confidence colors:** emerald = verified, amber = partial, zinc = unconfirmed
- **Fonts:** Inter (`font-ui`) for UI, JetBrains Mono (`font-data`) for labels/data
- **CSS:** Tailwind v4 (`@import "tailwindcss"`) + CSS modules for some older pages + CSS variables in `:root` for shared tokens
