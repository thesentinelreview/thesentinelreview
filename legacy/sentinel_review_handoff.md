# Sentinel Review — Project Handoff

**Version:** 0.1 (MVP scope)
**Owner:** Jacob
**Last updated:** 7 May 2026
**Purpose:** Brief for Claude Code to scaffold and build the v0.1 product.

---

## TL;DR for Claude Code

Build a public, free, prosumer-grade conflict intelligence dashboard for the OSINT enthusiast / analyst community. v0.1 covers a single theater (Ukraine), shows a live event map, generates an AI daily briefing, and tracks source reliability. The product wins or loses on **verification credibility** — every event must be traceable to its sources and labeled with a confidence level. Do not build user accounts, paid tiers, asset overlays, or corporate features in v0.1.

---

## 1. Strategic Context (read this before scoping)

### What this is
A web-based OSINT dashboard that aggregates, verifies, and presents conflict events from open sources, with AI-generated briefings on top. Closest reference points: Liveuamap (real-time but shallow), ACLED (rigorous but slow), ISW daily assessments (smart but static prose). The product sits between them — fast like Liveuamap, analytically credible like ACLED, more interactive than ISW.

### Who it's for
**Primary user (v0.1):** OSINT enthusiasts, prosumer analysts, conflict-focused journalists, Substack/YouTube creators covering the Ukraine war. They are technically literate, distrust marketing fluff, value transparency, and will publicly roast tools that get verification wrong.

**Secondary / future user (v1.0+):** Corporate security teams who want to overlay their own assets on the map. Do not build for them yet, but architect the data layer cleanly so this becomes a future extension, not a rewrite.

### Wedge strategy
Prosumer-first to build the data pipeline, methodology, and brand credibility. Corporate / enterprise tier comes later, on top of the same engine. Every product decision in v0.1 should reinforce the prosumer wedge, not hedge toward enterprise.

### What "good" looks like for v0.1
- A respected OSINT account on X publicly endorses the tool.
- A Substacker embeds the daily briefing or a map snapshot in their post.
- 5–10 specific power users give detailed feedback weekly.
- The verification methodology is documented publicly and survives scrutiny.

### What "bad" looks like
- A widely-shared screenshot of the map showing a fabricated event boosted by an information operation.
- An AI briefing publishes a confidently-wrong claim that gets picked up by media.
- The product feels like generic SaaS instead of analyst tradecraft.

---

## 2. v0.1 MVP Scope

### In scope
- Single theater: Ukraine (eastern oblasts as the focus).
- Live event map with three event types: strike/impact, clash/contact, movement.
- Time scrubber for last 24h / 7d / 30d.
- Right-rail panels: at-a-glance stats, 7-day intensity chart, active alerts feed.
- AI-generated daily briefing (2–3 paragraphs, machine-drafted, marked as such).
- Top sources panel with rolling verification rate.
- Public, no login required.
- Embed code for briefing and map snapshots (free, with attribution).
- Methodology page explaining verification rules.

### Explicitly out of scope (do NOT build in v0.1)
- User authentication / accounts.
- Paid tiers, payment processing.
- Custom alerting or proximity-based alerts.
- Asset overlays (the corporate feature).
- Multiple theaters (Gaza, Sudan, Myanmar — all later).
- Mobile-native app (responsive web only).
- Real-time push notifications.
- Community / commenting / chat features.
- API access (deferred to v0.2).
- Anything resembling weapons, targeting, or operational tasking.

---

## 3. Recommended Tech Stack

This stack is opinionated for a solo founder building solo with Claude Code. Substitute if you have strong preferences, but keep the constraints (managed services, low ops burden, fast iteration).

**Frontend**
- Next.js 14+ (App Router), TypeScript.
- Tailwind CSS for styling, with a custom theme matching the mockup design tokens.
- MapLibre GL JS for the map (open source, no Mapbox token, can self-host tiles via OpenFreeMap or Stadia).
- Recharts or visx for the intensity bar chart.
- IBM Plex font family via Google Fonts.

**Backend / Data**
- PostgreSQL with PostGIS extension for geospatial event storage. Hosted on Supabase or Neon.
- Python for ingestion workers (the OSINT data wrangling ecosystem is mostly Python).
- A simple job queue: start with cron + Postgres-backed queue (`pg_cron` or a `jobs` table polled by a worker). Defer Redis/Celery until the volume needs it.
- Object storage (Supabase Storage or S3) for cached source artifacts (screenshots, archived posts).

**LLM Layer**
- Anthropic API (Claude) for entity extraction, deduplication, briefing generation. Use the latest Sonnet for cost-effective bulk work; reserve Opus for the daily briefing draft where quality matters most.
- Structured outputs for entity extraction (locations, event type, actor, casualty estimates, source links).

**Hosting**
- Frontend: Vercel.
- Database: Supabase or Neon.
- Workers: Railway or Fly.io for the Python ingestion services.
- Total target cost for v0.1: under $100/month.

**Repo structure (suggested)**
```
sentinel-review/
├── apps/
│   ├── web/              # Next.js frontend
│   └── ingest/           # Python ingestion workers
├── packages/
│   └── db/               # Shared Prisma schema or SQL migrations
├── docs/
│   └── methodology.md    # Public verification methodology
└── README.md
```

---

## 4. Data Architecture

### Core entities

**`sources`**
- `id`, `handle` (e.g. `@DefMon3`), `platform` (`x`, `telegram`, `rss`, `wire`), `display_name`, `url`, `is_active`, `notes`.
- Manually curated seed list for v0.1 (~30–50 sources). No auto-discovery.

**`raw_posts`**
- `id`, `source_id`, `external_id`, `posted_at`, `text`, `media_urls[]`, `archive_url`, `ingested_at`.
- Append-only. Never mutated.

**`events`**
- `id`, `event_type` (`strike` | `clash` | `movement`), `occurred_at`, `location` (PostGIS POINT), `location_name`, `oblast`, `actor` (nullable), `description`, `confidence` (`verified` | `partial` | `unconfirmed`), `published_at`, `human_reviewed_at`, `human_reviewer_notes`.
- The presentation-layer object. One event can be supported by many `raw_posts`.

**`event_sources`** (join table)
- `event_id`, `source_id`, `raw_post_id`, `relationship` (`primary` | `corroborating` | `contradicting`).

**`briefings`**
- `id`, `theater`, `period_start`, `period_end`, `draft_text`, `published_text`, `status` (`draft` | `published`), `created_at`, `event_ids[]` (the events this briefing references).

**`source_reliability`** (materialized view, refreshed hourly)
- `source_id`, `events_30d`, `verified_rate_30d`, `last_event_at`.

### Pipeline

```
[Ingestion workers]  →  raw_posts
       ↓
[LLM entity extraction]  →  candidate events (with linked raw_posts)
       ↓
[Deduplication / clustering]  →  merged candidates
       ↓
[Verification scoring]  →  events table with confidence label
       ↓
[Human review queue]  →  events with human_reviewed_at set
       ↓
[Briefing generator]  (runs nightly + on-demand)
       ↓
[Frontend API]
```

### Verification rules (v0.1)
This is the most important section. Get this wrong and the product fails.

- **`verified`**: ≥2 independent sources from different platforms or different verified accounts AND (geolocated footage OR official acknowledgment OR matching local press wire).
- **`partial`**: ≥2 sources but all on the same platform, OR one verified-tier source plus one corroborating circumstantial signal.
- **`unconfirmed`**: Single source, or multiple sources tracing to a common origin.
- Events flagged by the LLM as high-impact (mass-casualty, escalatory) are held in human review queue regardless of source count.
- Every event displays its source list with platform badges; users can audit the chain.
- Confidence labels are visible everywhere — map pin opacity, alerts feed, briefing text.

### Source curation
v0.1 starts with a manually-curated seed list. Suggested categories and example accounts (Jacob to finalize):
- Long-running OSINT accounts on X with established track records.
- Geolocation specialists (DefMon, GeoConfirmed, etc.).
- Reuters / AP / AFP wire feeds.
- Local Ukrainian and Russian press (with appropriate skepticism toward both).
- Selected Telegram milbloggers (track separately — high volume, lower verification rate).
- ACLED API for backfill and cross-validation (they publish a public dataset).

---

## 5. Frontend Specs

The static design is established in the existing mockup file (`sentinel_review_dashboard.html`). Use it as the visual source of truth.

### Design tokens
```
--bg: #0c0d10
--surface: #141519
--surface-2: #1a1c22
--border: #26282f
--border-strong: #3a3d46
--text: #e6e4dc
--text-secondary: #989790
--text-tertiary: #5d5c58
--red: #e63946       /* strike */
--amber: #f4a261     /* clash */
--blue: #5b9eff      /* movement */
--green: #52b788     /* verified */
```

Fonts: IBM Plex Sans (body), IBM Plex Mono (data/timestamps), IBM Plex Sans Condensed (headings/UI labels). Two weights only: 400 and 500/600. Sentence case for prose; uppercase with letter-spacing for UI labels.

### Page structure (v0.1)
- `/` — the dashboard (matches mockup).
- `/event/[id]` — single event detail page with full source list, archived screenshots, geolocation evidence, change history.
- `/briefing/[id]` — full daily briefing (longer-form than the dashboard preview), shareable URL.
- `/sources` — public source leaderboard with reliability stats.
- `/methodology` — verification rules, editorial policy, content warnings.
- `/about` — what this is, who runs it, contact.
- `/embed/briefing/[id]` — bare iframe-friendly briefing for embeds.
- `/embed/map` — bare iframe-friendly map snapshot.

### Interactions to build
- Map pins clickable → side drawer with event details and source list.
- Map pin clusters when zoomed out (use MapLibre's built-in clustering).
- Time scrubber updates the displayed events (server-side query with `occurred_at` range).
- "Embed ↗" buttons open a modal with copyable iframe code.
- "Export" downloads PNG of current map state (use `html-to-image` or similar).
- Hover on a pin shows the popover from the mockup.

### Accessibility
- Color is never the only signal — every confidence level has both a color and a text label.
- Keyboard navigable.
- Map content has a tabular fallback at `/events` for screen readers.
- All time displays in user's local timezone with UTC tooltip.

---

## 6. AI Briefing Generation

### Prompt structure (high level)
The briefing generator runs against a structured input:
- Event list for the period (verified + partial), grouped by region.
- 7-day rolling baselines for each region.
- Notable shifts (events ↑ or ↓ vs. baseline).
- Single-source / unconfirmed cluster summaries (called out separately).

Output requirements for the LLM:
- 2–3 paragraphs, max 250 words.
- Plain prose, no marketing language.
- Distinguish verified from unconfirmed in the text itself ("two clusters are corroborated," "single-sourced and unverified").
- Never speculate beyond the input data.
- End with a one-line note on what to watch over the next 24h.
- Returns structured JSON: `{draft_text, referenced_event_ids, confidence_summary}`.

### Editorial guardrails
- Briefing is always marked `AI DRAFT` until a human reviews and clicks publish.
- For v0.1, Jacob is the human reviewer. Build a simple `/admin/briefings` page (basic auth, env-based password) for review and publishing.
- Never auto-publish.
- Log every prompt/response for retrospective review.

---

## 7. Build Sequence (suggested 4-week plan)

### Week 1 — Foundation
- Set up monorepo, Next.js app, Supabase project, Python worker scaffold.
- Implement DB schema and migrations.
- Build the static dashboard UI from the mockup, populated with seed data.
- Build `/methodology` and `/about` pages.

### Week 2 — Map and core UI
- Integrate MapLibre with Ukraine basemap.
- Wire pins to events from Postgres.
- Build event detail page.
- Build time scrubber and intensity chart with real seed data.
- Build top-sources panel (computed from materialized view).

### Week 3 — Ingestion and verification
- Build one ingestion worker per source platform (start with RSS and Telegram public channels — easiest to ingest legally).
- LLM entity extraction pipeline.
- Deduplication / clustering logic.
- Confidence scoring rules.
- Admin review queue.

### Week 4 — Briefing and polish
- Daily briefing generator.
- Admin page for review and publishing.
- Embed endpoints for briefings and map snapshots.
- Deploy to production.
- Recruit first 5 users for feedback.

If a week slips (it will), cut features inside the week, not the week itself. Ship something live by end of week 4 even if it's rougher than planned.

---

## 8. Risks and Watchouts

### Verification failure
The single largest risk. A false-positive event amplified by your tool can be cited in real-world reporting and cause real harm. Mitigations: conservative defaults (when in doubt, label `unconfirmed`), human review for high-impact events, public methodology page, "report this event" feedback link on every event.

### Information operations
State-aligned actors actively try to poison OSINT inputs. Don't trust any single source unconditionally, even longstanding ones. Source reliability scoring is partly a defense mechanism — accounts whose verification rate drops should be flagged.

### Platform Terms of Service
- Telegram: public channels are generally OK to ingest via the official API.
- X / Twitter: API access is now expensive and restricted. Investigate options before building hard dependencies.
- Always store archive URLs (web.archive.org snapshots) so the source is preserved if the original is deleted.

### Graphic content
War footage is graphic. v0.1 should not embed media directly — link out to source URLs with content warnings, or store screenshots in storage with blur-by-default UI.

### LLM hallucination in briefings
The LLM will occasionally invent details not in the input. Mitigation: always require the briefing prompt to cite specific event IDs from the input list; reject briefings that reference events not in the input.

### Solo founder burnout
The most underrated risk. The infrastructure described here is buildable solo, but only if scope discipline holds. Every feature past v0.1 needs to justify itself against the cost of one more thing to maintain.

---

## 9. Open Decisions (Jacob to finalize)

- [ ] Final source seed list (target: 30–50 accounts/feeds for Ukraine).
- [ ] X/Twitter ingestion strategy given current API costs.
- [ ] Hosting choice: Vercel + Supabase vs. self-hosted on a single VPS.
- [ ] Editorial stance on Russian-state-aligned sources (include with low weight, or exclude entirely).
- [ ] Brand: keep "Sentinel Review" (existing project) or rebrand for the dashboard.
- [ ] License of the codebase (private to start; consider open-source methodology + closed-source code).

---

## 10. What to Hand Claude Code First

Start with this prompt (or close to it) in Claude Code:

> Read this handoff document at `docs/handoff.md`. Set up a Next.js 14 + TypeScript + Tailwind monorepo following the structure in section 3. Implement the static dashboard UI from `mocks/sentinel_review_dashboard.html` as a real Next.js page at `/`, using the design tokens in section 5. Use placeholder data from a local JSON file for now — we'll wire up the database in the next phase. Stop after the static page renders correctly and ask before continuing.

Iterate from there one phase at a time. Resist the urge to have Claude Code build the whole thing in one shot — review each phase, give feedback, course-correct.

---

## Appendix: Reference Materials

- The visual mockup: `sentinel_review_dashboard.html`
- MapLibre GL JS docs: https://maplibre.org/
- ACLED data access: https://acleddata.com/data-export-tool/
- Bellingcat methodology (read for cultural reference): https://www.bellingcat.com/resources/
- ISW Ukraine assessments (read for tone reference): https://www.understandingwar.org/

---

*This handoff is v0.1 and explicitly avoids over-specifying. Decisions you make during the build will be better than decisions made now — the doc is here to anchor scope and surface the things that are easy to get wrong, not to predict the future. When in doubt, choose the simpler option and the more conservative editorial stance.*
