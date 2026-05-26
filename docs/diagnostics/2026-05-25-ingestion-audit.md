# Ingestion audit — "source ingestion appears dead"

**Data snapshot:** 2026-05-26 02:34 UTC (Neon/Supabase `ugpqgfvdqupttqhogavc`, production).
**Verdict:** Ingestion is **healthy**. The "dead" `○ TG ○ X ○ RSS ○ GDELT ○ BSKY` strip is a
**dashboard display artifact**, not an outage. Companion fix: PR `fix/p1e-sensorstrip-pills`.

---

## 1. Per-platform ingestion (all five are live)

| platform | active sources | posts 30m | posts 90m | posts 24h | posts 7d | last post |
|---|---|---|---|---|---|---|
| bluesky | 25 | 0 | 0 | 44 | 123 | 00:47 |
| gdelt | 4 | 0 | 91 | 355 | 1601 | 01:45 |
| rss | 20 | 0 | 1 | 181 | 434 | 01:27 |
| telegram | 11 | 0 | 1 | 182 | 465 | 01:28 |
| x | 15 | 0 | 0 | 83 | 370 | 00:43 |

Every platform posted within the last ~2 hours and produced hundreds–thousands of posts in 7 days.
Nothing is dead.

## 2. Jobs — zero failures

```
status   n     window
done     918   2026-05-25 06:41 → 2026-05-26 01:37
```

918 jobs in the last 24h, **all `done`, zero `error`/`pending`/`failed`**. Note: there is **no
`failed_jobs` table** in this schema — job state lives in `jobs.status`. The handoff's
"`failed_jobs_24h` critical" metric has no basis in the current data.

## 3. Root cause of the dead pills

`getSensorStripData` (`apps/web/lib/queries.ts:387`) counts `raw_posts` from the **last 30 minutes**
(`queries.ts:447`) and `SensorStrip.tsx:23` renders a platform active only when `count >= 1`.

But posting is **bursty with long quiet gaps**, not steady — so a 30-minute window is empty most of
the time even when ingestion is perfectly healthy:

| platform | mins since last post | median gap | p90 gap | max gap (24h) |
|---|---|---|---|---|
| gdelt | 49 | 0.0m | 0.0m | 270m |
| telegram | 65 | 3.5m | 12.8m | 165m |
| rss | 67 | 2.6m | 11.4m | 162m |
| bluesky | 106 | 0.1m | 77.0m | 272m |
| x | 110 | 2.7m | 24.7m | 230m |

At the snapshot moment **all five platforms had 0 posts in the trailing 30 min** (the closest was
gdelt at 49 min) → every pill reads `○ inactive`. This is the exact screenshot symptom.

A second, compounding cause: the current query scopes posts to the theater via **event linkage**
(a post only counts if it produced an event inside the theater bbox). GDELT is **100% LLM-skipped**
(§5), so it produces no events and its pill can *never* light up under event-linkage scoping, even
though it is the highest-volume platform.

### Recommended fix (implemented in `fix/p1e-sensorstrip-pills`)
1. **Widen the window to a named constant `PILL_WINDOW_MINUTES = 180` (3h).** A 90-minute window
   (the figure in the original plan) is **insufficient**: x and bluesky routinely gap 100–270 min
   while healthy, and both were dark at 90 min in this snapshot. 180 min covers normal quiet gaps
   for all five; pills only go dark on a genuine multi-hour silence. The constant is trivially
   tunable in review.
2. **Scope by source assignment, not event linkage:** count posts from active sources whose
   `theaters` array contains the selected theater. This counts GDELT/RSS volume regardless of
   whether a post became an event.
3. Update the pill tooltip label (`SensorStrip.tsx:27`) to match the new window.

> Note: for sparse theaters (Iran/Sudan) some pills will still read inactive — that is *honest*,
> because those theaters' dedicated sources are largely silent (§4), not because of a display bug.

## 4. `last_post_at` / `health_status` are never written — and 42 sources are truly silent

**All 75 active sources have `last_post_at IS NULL` and `health_status = 'unknown'`.** The pipeline
does not maintain these columns. Any integrity check or alert keyed on `last_post_at` will fire
**permanently** — this is the "silent_active_sources warning permanently firing" from the handoff.
The warning is a false positive driven by an unpopulated column; the reliable silence signal is a
`raw_posts` join.

Measured against actual `raw_posts`, **42 of 75 active sources (56%) have produced zero posts ever:**

- **bluesky (20):** bechamilton, defense-of-ukraine, emadbadi, eoghanmacguire, frontiermyanmar,
  gbutensky, imatv, kasperhoffmann, lapatina, matnashed, myanmar-now, newsfeedukraine, ntabrizy,
  osinttechnical, paulmcleary, rhfontaine, shayan86, smohyeddin, uacontrolmap, unishka
- **rss (12):** centcom_iran, centcom_sudan, eucom_ukraine, frontiermyanmar_rss, indopacom_myanmar,
  iranintl_rss, irrawaddy_rss, isw_ukraine, mizzima_rss, sudantribune_rss, tni_myanmar_rss, unian_rss
- **telegram (6):** IranIntl_En, irgcnews, militarylandnet, UAControlMap, UkrainianFront, warmonitor3
- **x (4):** @DefMon3, @Myanmar_OSINT, @RadioDabaanga, @UAWeapons

The silent set skews heavily toward **Iran / Sudan / Myanmar** sources (CENTCOM/INDOPACOM feeds,
Sudan Tribune, Iran International, Irrawaddy, Mizzima, Frontier Myanmar, Myanmar Now …). This is the
upstream reason those theaters have so little corroborated coverage (see the briefing cascade,
PR `fix/p1d-theater-briefings`).

**Recommendations (deferred — not actioned in this batch):**
- Populate `sources.last_post_at` / `health_status` from the ingest path so health checks are real.
- Triage the 42 silent sources: dead bluesky/X handles and broken RSS endpoints should be repaired or
  deactivated so they stop diluting "active source" counts and firing false alerts.

## 5. LLM skip rates (7d) — why volume ≠ events

| platform | posts 7d | skipped | skip % |
|---|---|---|---|
| gdelt | 1601 | 1601 | 100.0% |
| bluesky | 123 | 115 | 93.5% |
| telegram | 465 | 395 | 84.9% |
| x | 370 | 303 | 81.9% |
| rss | 434 | 315 | 72.6% |

GDELT contributes **zero events** (100% skipped GKG metadata) despite being the largest feed. This is
expected behavior but confirms why event-linkage pill scoping (§3) misrepresents GDELT as dead.

## 6. Per-platform disposition

| platform | status | root cause of "dead pill" | fix | effort | ship |
|---|---|---|---|---|---|
| GDELT | healthy | 30-min window + event-linkage scoping (100% skip → no events) | P1.E | S | this batch |
| Telegram | healthy | 30-min window shorter than normal quiet gap | P1.E | S | this batch |
| RSS | healthy | 30-min window shorter than normal quiet gap | P1.E | S | this batch |
| X | healthy | 30-min window << 100–230 min posting gap | P1.E | S | this batch |
| Bluesky | healthy | 30-min window << 77–272 min posting gap | P1.E | S | this batch |

No ingestion code changes are required. All five fixes are the single SensorStrip query change in P1.E.

## 7. Data consistency observations (file for later — not fixed here)

- **Web vs ingest Iran bbox mismatch.** Web `THEATER_BBOX.iran` (`apps/web/lib/queries.ts:24`) is
  `[32, 10, 64, 42]`; ingest `_THEATER_BBOX["iran"]` (`apps/ingest/sentinel/db.py:281`) is
  `(44, 25, 64, 40)`. The web box is far larger (lon 32–64, lat 10–42) and overlaps the Sudan / Red
  Sea / Arabian-peninsula region, so the dashboard's "Iran" theater can absorb events the ingest
  pipeline would classify as Sudan or "other." The two definitions should be reconciled to a single
  source of truth.
