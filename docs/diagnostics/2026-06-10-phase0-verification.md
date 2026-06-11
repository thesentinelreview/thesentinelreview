# Phase 0 Verification Pass — 2026-06-10

**Scope:** read-only recon per `2026-06-10_CC_Directive_Phase0_Verification.md`. No fixes, no writes.
**Method:** parallel read-only subagents per item; two read-only `SELECT` queries against prod Supabase
(`ugpqgfvdqupttqhogavc`); one anonymous fetch of the production dashboard's rendered HTML.
**Secrets hygiene:** key prefixes only throughout.

The two production SQL statements executed (both pure SELECT, no DDL/DML):

1. `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.candidate_sources'::regclass, 'public.sources'::regclass) AND contype = 'c'`
2. `SELECT (SELECT count(*) FROM user_subscriptions), (SELECT count(*) FROM user_subscriptions WHERE status='active' AND tier <> 'watch'), (SELECT count(*) FROM user_subscriptions WHERE is_founding), (SELECT count(*) FROM processed_stripe_events), (SELECT count(*) FROM watches)`

---

## 1. Stripe wiring state

**Finding.** The billing stack is **fully built and functional, not stubs** — materially more complete than the
roadmap assumed. Checkout, a signature-verified + idempotent webhook, an activation endpoint, a billing-portal
endpoint, and a price→tier mapping module all exist and are production-grade. What's missing is not code: it's
(a) Stripe products/prices created and their IDs in env, and (b) any tier *enforcement* (see item 2).

**Evidence.**
- Checkout: `apps/web/app/api/checkout/route.ts` — Clerk auth (11–14), priceId validated via `tierForPriceId()`
  (17–22), `stripe.checkout.sessions.create` in subscription mode with `client_reference_id = Clerk user id`
  (25–33), success URL → `/api/activate`.
- Activation: `apps/web/app/api/activate/route.ts:8–60` — verifies session paid + `client_reference_id` matches
  the logged-in user, UPSERTs `user_subscriptions` (45–56).
- Webhook: `apps/web/app/api/webhooks/stripe/route.ts` — `stripe.webhooks.constructEvent` with
  `STRIPE_WEBHOOK_SECRET` (20); idempotency via INSERT…ON CONFLICT into `processed_stripe_events` with early
  duplicate return (30–38); handles `checkout.session.completed` (42–70), `customer.subscription.updated`
  (73–100), `customer.subscription.deleted` (103–111); deletes the dedup row on processing failure so Stripe
  retries (114–117). All queries parameterized.
- Price→tier map: `apps/web/lib/stripe.ts:6–33` — env-driven, no hardcoded `price_`/`prod_` IDs anywhere in the
  repo (grep for `price_`, `prod_`, `sk_`, `pk_`, `whsec` found only `.env.example` placeholders).
- Env vars the code reads: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_ANALYST_PRICE_MONTHLY`,
  `NEXT_PUBLIC_STRIPE_ANALYST_PRICE_YEARLY`, `NEXT_PUBLIC_STRIPE_BUREAU_PRICE_MONTHLY`,
  `NEXT_PUBLIC_STRIPE_BUREAU_PRICE_YEARLY`, `NEXT_PUBLIC_SITE_URL`.
- **`.env.example` is wrong**: `apps/web/.env.example:28–29` names them
  `NEXT_PUBLIC_STRIPE_ANALYST_MONTHLY_PRICE_ID` / `…_YEARLY_PRICE_ID` — neither matches the code, and the two
  bureau vars are absent entirely.
- **Vercel production env: partially blocked.** The Vercel MCP toolset in this session has no env-var read
  endpoint (`get_project` returns metadata only), so presence/prefix of `STRIPE_SECRET_KEY` etc. in Vercel could
  not be verified directly. Indirect evidence from the anonymously rendered production `/pricing` page: zero
  `price_` strings appear in the served HTML/RSC payload, and `processed_stripe_events` is empty (query 2 → 0
  rows — no webhook event has ever been received). Consistent with **Stripe price env vars unset and webhook not
  yet registered**, but not conclusive for the signed-in render path.

**Impact on roadmap.** W1-1 shrinks dramatically: it is not "build entitlements + billing," it is (1) create
Stripe products/prices (once, deliberately, IDs recorded in the PR), (2) set the 4 price ID vars + webhook
secret in Vercel, (3) register the webhook endpoint in Stripe, (4) fix `.env.example` names. The build work
moves to W1-2 (enforcement), which is currently zero.

## 2. Subscriptions / entitlement remnants

**Finding.** Schema and sync are done; enforcement is entirely absent. `user_subscriptions` (tier:
watch/analyst/bureau, status, `is_founding`, Stripe IDs) and `processed_stripe_events` exist with the webhook
keeping them in sync. There is **no tier check on any route or page** — auth (sign-in) is the only gate, and
`/app/feed` is deliberately public. No account/billing/settings page exists. Clerk metadata is not used for
entitlements (DB is the single source of truth; only `sessionClaims.email` is read). `is_founding` is written
but never read. Live row counts: **`user_subscriptions` = 0, `processed_stripe_events` = 0, `watches` = 0**
(query 2).

**Evidence.**
- Tables: `packages/db/migrations/0003_user_subscriptions.sql:1–31` (no later ALTERs),
  `0009_stripe_webhook_idempotency.sql:1–18`; watchlist `0009_watches.sql:1–22`.
- Tier helpers exist and are unused by any guard: `apps/web/lib/auth.ts:4` (`Tier` type), `:25–39`
  (`getUserTier()` → 'watch' default), `:41–67` (`getSubscriptionDetails()`).
- Middleware: `apps/web/proxy.ts:11–17` matchers — `/api/(.*)` requires auth except `/api/webhooks/stripe(.*)`;
  `/app(.*)` requires sign-in except `/app/feed(.*)`; `auth.protect()` at :31 enforces *authentication only*.
- Admin: `apps/web/app/admin/tieout/page.tsx:63` gated by `isAdmin()` reading `ADMIN_CLERK_USER_IDS` env
  allowlist (`apps/web/lib/auth.ts`) — no DB/Clerk role.
- Absences (verified by grep, not assumption): no tier-conditional rendering, no quota/rate-limit code despite
  the pricing table promising "1K calls/day" analyst / "25K calls/day" bureau (`apps/web/app/pricing/page.tsx:39–68`),
  no `/account` route, `is_founding` never read outside the activation/webhook writes.

**Impact on roadmap.** W1-1 must NOT recreate the schema or webhook (double-build risk eliminated). W1-2 (tier
clamp) is the real build: route guards + feature gates from `getUserTier()`. W1-3 (account page) is greenfield.
The empty tables also mean the Clerk dev→prod swap (item 6) is currently **free of data consequences** — no
`clerk_user_id` rows to orphan. Do it before the first paid subscriber, exactly as the handoff schedules it.

## 3. `/embed/briefing/[id]`

**Finding.** Iframe-friendly briefing view, **fully public by design** — not in the Clerk matcher, no token, no
rate limit. Renders the complete briefing text (including `draft_text` for unreviewed briefings, flagged "AI
Draft"), source count, and confidence rollup for any briefing UUID. Sibling `/embed/map` is likewise public and
serves all published events with coordinates and descriptions. The main briefing page generates copy-paste embed
code, so public embeds are intentional product surface; the consequence is that **embed routes bypass any future
paywall** unless W1-2 addresses them.

**Evidence.** Route: `apps/web/app/embed/briefing/[id]/page.tsx:1–71` (`force-dynamic` at :4, paragraphs at
:45–54); data: `getFullBriefing()` `apps/web/lib/queries.ts:1459–1521` (fetches `draft_text` OR
`published_text`, no theater/visibility filter beyond existence); auth: `apps/web/proxy.ts:11–17` protects only
`/app(.*)` and `/api/(.*)` — `/embed/*` matches neither. Linked from: embed-code generator at
`apps/web/app/briefing/[id]/page.tsx:26` (iframe snippet, shown at :81–89), docs mentions in
`sentinel_review_handoff.md:209–210`, `DASHBOARD_HANDOFF.md:153`. Not referenced by the static site or X bot.

**Impact on roadmap.** W1-2 scope must explicitly decide the embed posture: leave public (top-of-funnel) or gate
behind signed tokens. If briefings become an Analyst entitlement, today's embed route is a complete bypass.

## 4. Pricing surfaces inventory

**Finding.** The static `pricing.html` and dashboard `/pricing` are near-identical in tiers/prices ($0 Watch /
$12-mo–$99-yr founding Analyst, $25/$249 standard / $129 Bureau "Coming Soon") but **conflict on Watch-tier
coverage**: static claims "all active theaters," dashboard says "Ukraine + Middle East." The founding counter
**"247 / 250" is hardcoded in both surfaces and is fabricated**: prod has 0 subscription rows (query 2), so the
implied "3 founding seats taken" is fiction on a live marketing surface — a direct hard-rule-1 violation to fix
in W1-5. No `_redirects` file exists yet.

**Evidence.**
- Counters: `pricing.html:292` (`247 / 250`, with the comment "UPDATE THIS COUNTER MANUALLY (or wire to dynamic
  source)" at :291) and `apps/web/app/pricing/page.tsx:220`; scarcity copy at `pricing.html:288,433,473` and
  `page.tsx:80,215,432`. Confirmed served live: anonymous fetch of production `/pricing` contains `247 / 250`.
- Coverage conflict: `pricing.html:310` ("all active theaters") vs `page.tsx:245` ("Ukraine + Middle East");
  comparison-table variant `pricing.html:397` vs `page.tsx:47`.
- CTAs: static Analyst buttons call `startCheckout()` → POST `https://dashboard.thesentinelreview.com/api/checkout`
  (`pricing.html:560`, 401→sign-up redirect at :569); dashboard CTAs are auth/env-conditional
  (`page.tsx:253–320`); Bureau is `mailto:` on both (`pricing.html:366`, `page.tsx:360`).
- Deploy config: no `_redirects`, `_headers`, or `wrangler.toml` anywhere in the repo root.
- **Redirect recommendation:** Cloudflare Pages `_redirects` file at repo root with 301s — covering all three
  spellings (`/pricing`, `/pricing.html`, `/pricing/`) → `https://dashboard.thesentinelreview.com/pricing`.
  Edge-side 301 preserves link equity and is one file; meta refresh is slower, leaves the stale page indexed,
  and keeps two sources of pricing truth alive.

**Impact on roadmap.** W1-5 (pricing-page edits) should: kill or wire the counter on BOTH surfaces (DB-backed
count is trivial — `count(*) WHERE is_founding`), resolve the Watch-coverage claim against actual product
behavior, and add the `_redirects` file so one pricing surface remains.

## 5. Enum gaps (confirmed)

**Finding.** Both suspected gaps confirmed, plus one bonus mismatch. Frontend `Platform` union and the feed
filter lack `gdelt` (users cannot filter GDELT posts; badge falls back to a raw-string label). The **live**
`candidate_sources` platform CHECK lacks `wire` (a wire candidate cannot pass discovery). Bonus: the live
`sources_theaters_check` allows `israel` — a theater value the web app's theater config doesn't know about.

**Evidence.**
- Frontend union: `apps/web/lib/types.ts:3` — `"x" | "telegram" | "rss" | "wire" | "bluesky"` (no gdelt).
  Filter chips: `apps/web/app/app/feed/page.tsx:15` `ALL_PLATFORMS` — same five. Style map has gdelt + fallback
  (`apps/web/components/ds/tokens.ts:29–49`); `TopSources.tsx:5–11` lacks gdelt but has an uppercase fallback
  (:29–32). Sensor strip already counts gdelt (`apps/web/lib/types.ts:98`).
- Ingest knows six: `apps/ingest/sentinel/models.py:14` `Literal["x","telegram","rss","wire","bluesky","gdelt"]`.
- Live DB (query 1): `sources_platform_check` = `('x','telegram','rss','wire','bluesky','gdelt')`;
  `candidate_sources_platform_check` = `('x','telegram','bluesky','rss','gdelt')` — **no `wire`**. Matches repo
  files `0012_add_sources_2026_05.sql:17–18` and `0015_candidate_sources_and_source_health.sql:59–60` (no drift).
- Bonus: `sources_theaters_check` (query 1) ⊆ `('ukraine','iran','sudan','myanmar','israel')`.

**Impact on roadmap.** Confirms the parallel-lane enum-sync ticket as scoped: one TS union + one filter array +
one ALTER…CHECK migration (idempotent, drop+re-add). The `israel` theater value should be checked against the
web theater list in that same ticket.

## 6. Clerk environment

**Finding.** Production is served with a **`pk_test_` publishable key from the Clerk development instance
`coherent-pipefish-10.clerk.accounts.dev`** — confirmed from the live page render, not just the handoff. The
secret key could not be read (correctly so); a dev-instance pk implies the paired `sk_test_` of the same
instance. With `user_subscriptions` empty, swapping instances now loses nothing.

**Evidence.** Anonymous fetch of the production dashboard (canonical Vercel URL): `data-clerk-publishable-key`
prefix `pk_test_…`; decoded instance domain `coherent-pipefish-10.clerk.accounts.dev`. Env names the app expects:
`apps/web/.env.example:14–23`. Vercel env listing itself: blocked (no env-read tool in this session's Vercel
MCP), prefix evidence taken from the served HTML instead.

**Dev→prod migration requirements (research only, per Clerk deployment docs):**
1. Create a **production instance** in the Clerk app (cloned from dev at creation; settings made after cloning
   don't sync).
2. New keys `pk_live_…` / `sk_live_…` → update Vercel production env (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`; `CLERK_WEBHOOK_SECRET` only if Clerk webhooks get used — none exist in code today).
3. Production instances require a real domain: associate `thesentinelreview.com` (root) so session cookies work
   on the `dashboard.` subdomain.
4. **DNS records in Cloudflare** (issued by Clerk at setup): frontend API CNAME (`clerk.thesentinelreview.com`),
   accounts portal (`accounts.…`), and email DKIM CNAMEs (`clk._domainkey` etc.) — set DNS-only/unproxied per
   Clerk guidance; pairs naturally with the Resend DNS parallel ticket.
5. Social/OAuth providers (if any are enabled in the dev instance) need **own production OAuth credentials** —
   Clerk's shared dev credentials don't carry over.
6. **Users do not migrate** between instances: any account created against the dev instance will not exist in
   prod. Today that costs nothing (0 subscription rows); after first paid subscriber it would orphan
   `user_subscriptions.clerk_user_id` rows — hence: do this early in Week 1, never launch-eve (consistent with
   the handoff).

**Impact on roadmap.** Confirms the Week-1 Clerk task and gives it a hard ordering constraint: **before** W1-1
checkout goes live, because checkout writes `clerk_user_id` into `user_subscriptions`.

## 7. X bot capability

**Finding.** The bot (root `post_to_x.py`, run by the aggregator workflow) posts **single tweets only** — no
threads, no replies, no media. Tweepy 4.14 over API v2 (`create_tweet`), OAuth 1.0a user context with the four
`X_*` secrets (bearer optional). Text is `"{title}\n\n{link}"` truncated to 280 chars with 23 reserved for the
URL. Caps: 1 post/run, 3 posts/day, stories <12h old; URL-set dedup in `posted_state.json`; runs every 8h.
A "launch thread" is not something the current bot can post.

**Evidence.** `post_to_x.py:208` (`client.create_tweet(text=text)` — no `in_reply_to_tweet_id`), :149–158
(composition + truncation), :32–35 (`MAX_POSTS_PER_RUN=1`, `DAILY_POST_CAP=3`), :47–62 (credentials → tweepy
client), :69–93 + :170,185 (state/dedup), :219–236 (429 + duplicate-403 handling); feeds from `feed.xml` built
by `aggregate.py:354` (18 defense-news RSS feeds — **not** the Sentinel DB); schedule `.github/workflows/main.yml:4–11`
(`5 */8 * * *`), posting step `continue-on-error: true` at :44.

**Impact on roadmap.** Launch kit must target single standalone posts (or a human posts the thread manually).
If launch copy should come from Sentinel data rather than the aggregator's defense-news feed, that's new plumbing
— flag for the launch ticket, not assumed.

## 8. Briefing job shape

**Finding.** Two parallel briefing systems exist: the **Sentinel pipeline** (LLM over DB events → `briefings`
table → dashboard) and a **legacy root-level email pipeline** (`generate_briefing.py` over `feed.xml` →
Buttondown). The Sentinel prompt asks for 2–3 paragraphs (≤250 words) — overview → key events → optional watch
item — via a forced `record_briefing` tool call on `claude-opus-4-7`, and the row is **auto-published at insert**
(`status='published'`, no human review step). Text is stored as unstructured prose; the frontend splits on blank
lines. A BLUF restructure touches the prompt + tool schema, models, insert, one migration if sections become
columns, queries/types, and three renderers (BriefPane, briefing page, embed).

**Evidence.** Prompt: `apps/ingest/sentinel/pipeline/briefing.py:23–38`; tool schema :40–62; model
`apps/ingest/sentinel/config.py:18` (`claude-opus-4-7`), `max_tokens=2048`, prompt-cached system block (:73–86).
Auto-publish: `apps/ingest/sentinel/db.py:506–533` inserts `status='published'`, `published_at=now()`.
Schedule: `.github/workflows/sentinel-briefing.yml:5–6` (12:00 + 20:00 UTC) — note `scheduler.py:143–147` also
contains a 06:00 enqueue for the long-running-worker deployment mode, which GitHub Actions does not use.
Rendering: paragraph split `apps/web/lib/queries.ts:148–151`, 2-paragraph dashboard slice :1020–1031, headline
derivation `apps/web/components/watchfloor/BriefPane.tsx:9–17`. Legacy email path: root `generate_briefing.py:40–45`
(Buttondown, 09:23 UTC delivery), workflow `briefing.yml:10` (01:00 UTC).

**Impact on roadmap.** W2-3 (BLUF) is a full-pipeline change, not a prompt edit; the touchpoint list above is the
scope. Decide in W2-3 whether BLUF sections become DB columns (migration lane!) or stay prose-with-headings
(no migration — frontend parses headings). The auto-publish-with-no-review behavior and the "AI Draft" badge
semantics should be reconciled in the same ticket.

---

## Surprises

1. **The founding counter is fabricated on a live surface.** "247 / 250 spots remaining" is hardcoded on both
   pricing pages while prod has **zero** subscribers (query 2). This is the only active hard-rule-1 violation
   found; it predates the sprint. Fix belongs in W1-5 (wire to `count(*) FILTER (WHERE is_founding)` or remove).
2. **Stripe billing is already built end-to-end** (item 1). W1-1 as roadmapped would double-build; it reduces to
   Stripe-dashboard work + env vars + webhook registration + `.env.example` correction.
3. **Embed routes are a paywall bypass** (item 3) — fully public, render draft briefings, no rate limit.
4. **Briefings auto-publish with no review step** while the UI implies a review distinction ("AI Draft" badge
   reads as the exception; in fact nothing is ever human-reviewed — `db.py:506–533`).
5. **`.env.example` Stripe names don't match code** (item 1) — anyone configuring Vercel from the example file
   ships a silently broken pricing page.
6. **`israel` is a live theater enum value** (query 1) unknown to the web app's theater config.
7. **Clerk dev→prod is currently free** (0 user rows) but becomes lossy the moment the first subscriber signs up
   — hard ordering constraint for Week 1.
8. **Blocked sub-items:** Vercel env-var listing (no read endpoint in this session's MCP toolset) — Stripe/Clerk
   env presence in Vercel inferred from the served page + empty `processed_stripe_events` only; direct
   confirmation needs the Vercel dashboard.

## Recommended ticket adjustments

- **W1-1**: rescope from "build entitlements + billing" to "activate existing billing": create Stripe
  products/prices (once, IDs recorded in PR), set 4 price vars + `STRIPE_WEBHOOK_SECRET` in Vercel, register the
  webhook endpoint, fix `.env.example:28–29` names + add bureau vars. No schema or webhook code changes needed.
- **Clerk prod swap**: schedule **before** W1-1 go-live (checkout persists `clerk_user_id`; dev-instance IDs
  would orphan).
- **W1-2**: scope = build enforcement from scratch (none exists): route guards via `lib/auth.ts:getUserTier()`,
  plus an explicit decision on `/embed/*` posture (public funnel vs token-gated).
- **W1-3**: account page is greenfield; `/api/billing-portal` already exists to link to.
- **W1-5**: add the two-surface counter fix (DB-backed or removed), resolve the Watch "all theaters" vs
  "Ukraine + ME" claim, add root `_redirects` (301 × 3 paths) → dashboard pricing.
- **Enum-sync lane**: as scoped (TS union + `ALL_PLATFORMS` + `candidate_sources` CHECK migration); fold in the
  `israel` theater reconciliation.
- **W2-3 (BLUF)**: treat as full-pipeline ticket per item 8 touchpoints; decide columns-vs-prose early because
  the columns path enters the migration lane; reconcile auto-publish/review semantics in the same ticket.
- **Launch kit**: single X posts only (or manual threads); decide whether launch posts should source from
  Sentinel data (new plumbing) or the existing aggregator feed.
