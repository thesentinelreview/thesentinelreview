# Verification Rate Diagnostic — The Sentinel Review

**Scope:** read-only investigation. No fixes applied. Snapshot taken 2026-05-31.

**Headline:** the verified rate (1.9% over 7d, 0% across all theaters in 24h) is not throttled by hard corroboration. It is throttled by the **single-source funnel**. 93% of published events have exactly one source attached. Every other gate is downstream of that and would barely move the needle while gate (a) dominates.

---

## 0. Methodology — what is `verified`?

Verification rules implemented in `apps/ingest/sentinel/pipeline/scorer.py` (`classify()` is the canonical function, shared by initial scoring and the corroboration re-score):

```
verified    source_count >= 2 AND platform_count >= 2 AND strong_signal
partial     (>=2 sources & >=2 platforms, no strong_signal)
            OR (>=2 sources & strong_signal, same platform)
            OR (1 source & tier-1 & strong_signal)
unconfirmed everything else
```

`strong_signal = geolocated_footage OR coordinates_given OR landmarks_visible OR official_acknowledgment OR matching_press` — derived by the LLM at extraction time.

The dashboard (`apps/web/lib/queries.ts` → `getStats`) reads `events.confidence` directly. So "verified rate" on `/v2` is the count of `confidence='verified'` rows in the window, divided by the count of published events in the window. No drift between code-as-implemented and the methodology summarized in the task brief.

**Important schema constraint:** `events` stores only the final `confidence` — the three strong-signal flags (geo / official / press) are NOT persisted. So bucket (c) "multi-platform but missing strong signal" can only be inferred (multi-platform events whose `confidence ≠ verified` must have failed the strong-signal gate, given the rules above).

### Schema actually used

| Concern | Table.column |
|---|---|
| Ingested posts | `raw_posts (id, source_id, posted_at, ingested_at, processed_at, skip_reason, text, translated_text)` |
| Sources | `sources (id, handle, platform, trust_tier, is_active, theaters[], health_status, last_post_at, consecutive_errors, last_fetch_at)` |
| Events | `events (id, event_type, occurred_at, location geometry, location_name, oblast, confidence, published_at, weapon_type)` |
| Event↔source join | `event_sources (event_id, source_id, raw_post_id, relationship='primary'|'corroborating'|'contradicting')` |
| Jobs | `jobs (job_type, status='pending'|'running'|'done'|'failed', created_at, error)` |
| Briefings | `briefings (theater, status, event_ids[], created_at, published_at)` |

`raw_posts` has no location column — theater scoping for source-strip/freshness happens via `sources.theaters[]`.

---

## 1. The funnel — last 7 days, published events only

| Stage | Count | % of stage above |
|---|---:|---:|
| Raw posts ingested | 4,801 | — |
| Raw posts processed | 4,801 | 100% |
| Raw posts skipped (LLM filter) | 4,082 | 85% |
| Raw posts kept → extraction | 719 | 15% |
| **Published events** | **539** | — |
| Events with ≥2 distinct sources | 40 | 7.4% |
| Events with ≥2 distinct platforms | 20 | 3.7% |
| Events with strong signal (verified) | **10** | **1.9%** |

**Read:** the cliff is not at the strong-signal gate. It is at the very first corroboration step — getting a second source onto the same event at all. 499 of 539 events live and die as 1-source rows.

Confidence breakdown: 10 verified / 46 partial / 483 unconfirmed.

### Per-theater verified rate (7d, published)

| Theater | Events 7d | Verified 7d | Verified % |
|---|---:|---:|---:|
| Ukraine | 321 | 8 | 2.5% |
| Iran | 159 | 1 | 0.6% |
| Sudan | 9 | 0 | 0% |
| Myanmar | 10 | 0 | 0% |

24h verified rate is 0 in every theater. Headline number on the dashboard (1.9%) matches.

---

## 2. Sources per event

| Source count | Events | Share |
|---|---:|---:|
| 1 | 499 | 92.6% |
| 2 | 30 | 5.6% |
| 3+ | 10 | 1.9% |

**Read:** corroboration is the exception, not the rule. The only way to lift verified meaningfully is to push the "1" column down and the "2+" columns up.

---

## 3. Platforms per event (given ≥2 sources)

Of the 40 multi-source events:

| | Events | Share |
|---|---:|---:|
| Multi-source, multi-platform | 20 | 50% |
| Multi-source, same platform | 20 | 50% |

**Read:** half of all corroboration is platform-monoculture — usually two Telegram channels quoting the same upstream. Even when corroboration happens, half of it is wasted on the verified gate.

Platform pairs of the 20 multi-platform events (current confidence):

| Platforms | Verified | Partial |
|---|---:|---:|
| rss + telegram | 3 | 3 |
| rss + x | 2 | 2 |
| telegram + x | 1 | 2 |
| gdelt + rss | 0 | 2 |
| gdelt + telegram | 0 | 1 |
| rss + telegram + x | 2 | 0 |
| gdelt + rss + telegram | 1 | 0 |
| bluesky + rss + telegram + x | 1 | 0 |

When multi-platform fires, **50% clears verified** (10/20). That's a reasonable strong-signal pass rate — strong-signal is not the bottleneck either.

---

## 4. Why events stay unconfirmed — first failed gate

| Gate failed | Events 7d | Share | Plain read |
|---|---:|---:|---|
| (a) only 1 source | 499 | 92.6% | **The whole game.** Corroboration never happens. |
| (b) ≥2 sources, same platform | 20 | 3.7% | Echo-chamber: needs a cross-platform source on the same incident. |
| (c) ≥2 platforms, missing strong signal | 10 | 1.9% | The genuinely-hard case (no geo / no official statement / no matching press). |
| (d) verified | 10 | 1.9% | — |

**Read:** gate (a) is ~25× the size of every other gate combined. Any "fix the verified rate" plan that doesn't unblock (a) first is rearranging deck chairs.

---

## 5. Platform mix of all ingested events (7d, active sources)

| Platform | Raw posts | Kept | Skip % | Events touched |
|---|---:|---:|---:|---:|
| telegram | 1,208 | 249 | 79.4% | 241 |
| rss | 1,109 | 286 | 74.2% | 350 |
| x | 733 | 98 | 86.6% | 104 |
| gdelt | 1,543 | 70 | 95.5% | 39 |
| bluesky | 208 | 16 | 92.3% | 16 |

**Read:** platform diversity in the ingest pool is actually reasonable (5 platforms, no single one >35% of kept posts). The structural cross-platform capacity exists — what's missing is sources covering the same incident.

---

## 6. Source health — who's actually firing

67 active sources total. Health-classifier breakdown:

| Health | Active sources | Plain read |
|---|---:|---|
| healthy | 18 | 27% of the roster |
| **silent** | **46** | **69% — the dominant state** |
| erroring | 3 | All RSS feeds: `isw_ukraine` (T1), `frontiermyanmar_rss` (T1), `tni_myanmar_rss` (T2) |

### Health classifier is unreliable — false-silent flags

Several "silent" sources are posting heavily within the hour. Examples from the live snapshot:

| Source | Platform | Health | Posts 7d | Last post |
|---|---|---|---:|---|
| `tass_rss` | rss | **silent** | 54,536 | 1.5h ago |
| `gdelt_iran` | gdelt | **silent** | 2,698 | 1.8h ago |
| `meduza_rss` | rss | **silent** | 2,516 | 1.8 days ago |
| `@neonhandrail` | x | **silent** | 2,015 | 3.5h ago |
| `@GeoConfirmed` | x | **silent** | 1,696 | `NULL` (never set) |
| `@KofmanMichael` | x | **silent** | 92 | 3.5h ago |

The `last_post_at` column is being set by ingest, but the nightly health-check job classifies these as silent anyway. **Diagnose this before acting on "silent" counts — the silent population mixes truly-dead handles with false-silent live ones.**

### Specifically flagged channels — current status

All five named channels are still **deactivated** (`is_active = false`). They were not revived:

| Handle | Platform | is_active | health_status | last_post_at |
|---|---|---|---|---|
| `warmonitor3` | telegram | false | unknown | never |
| `UAControlMap` | telegram | false | unknown | never |
| `UkrainianFront` | telegram | false | unknown | never |
| `IranIntl_En` | telegram | false | unknown | never |
| `irgcnews` | telegram | false | unknown | never |

Alternate-platform mirrors exist for some but don't replace the Telegram pipe:

- `iranintl_rss` (RSS, **silent**, 1 post in 7d, last 2026-05-28)
- `iranintl.bsky.social` (Bluesky, inactive, never posted)
- `uacontrolmap.bsky.social` (Bluesky, **silent**, 0 posts ever)
- `warmonitor.net` (Bluesky, inactive, never posted)
- `uacontrolmap` (X, in `candidate_sources`, status=`discovered`, never promoted)

**Read:** the named Telegram channels still represent ~5 effectively-offline corroboration pipes, plus their RSS/Bluesky mirrors are also dead or silent. None of them is feeding the funnel.

### Healthy and high-volume — the working core

| Source | Platform | Posts 7d | Events touched 7d |
|---|---|---:|---:|
| `tasnimnews_en` | telegram | 155,382 | 124 |
| `ukrinform_rss` | rss | 22,692 | 110 |
| `interfax_ukraine_rss` | rss | 8,514 | 37 |
| `dva_majors` | telegram | 6,820 | 41 |
| `@ChrisO_wiki` | x | 5,520 | 10 |
| `rybar` | telegram | 3,535 | 33 |
| `kyivindependent_rss` | rss | 2,813 | 25 |
| `@OSINTtechnical` | x | 2,910 | 20 |
| `gdelt_ukraine` | gdelt | 2,070 | 20 |
| `thestudyofwar.bsky.social` | bluesky | 1,800 | 11 |

**Read:** about a dozen sources are doing essentially all the work. Lose one and the funnel notices.

---

## 7. Matching / dedup sanity check

Test: of 468 single-source unconfirmed events in 7d, how many have **another single-source event** of the same `event_type` within the dedup window (≤5km, ≤6h) — i.e. would have merged into a multi-source event if `find_duplicate()` had caught them?

| Metric | Value |
|---|---:|
| Single-source unconfirmed events (7d) | 468 |
| Events with at least one mergeable peer | 42 |
| Distinct clusterable groups | 38 |
| Clusterable share | **9.0%** |

**Read:** the matcher is not the bottleneck. Even a perfect merge of every clusterable pair would convert ~40 single-source events to multi-source — that's a 5pt lift to the multi-source rate, ~1pt to verified at most. The under-merge hypothesis is largely disproven by this data.

(Note: this only catches `event_type=event_type` matches — the dedup function itself only matches same-type. If cross-type merges were allowed — e.g. a "strike" and a "clash" at the same place/time describing one engagement — the number could grow, but that's a model change, not a matcher tuning.)

---

## 8. Known pipeline drains

### GDELT LLM-skip rate

| Platform | Raw 7d | Skipped | Skip % |
|---|---:|---:|---:|
| gdelt | 1,543 | 1,473 | **95.5%** |
| bluesky | 208 | 192 | 92.3% |
| x | 733 | 635 | 86.6% |
| telegram | 1,208 | 959 | 79.4% |
| rss | 1,109 | 823 | 74.2% |

**Read:** the "~92% GDELT skip" claim is confirmed (actually 95.5%). But the 4.5% that survives still contributes — GDELT touched 39 events as primary, 19 as corroborating in 7d. The skip rate is structural to the source, not a bug. Modest leverage.

### Failed jobs (7d)

| job_type | failed 24h | failed 7d | done 7d |
|---|---:|---:|---:|
| `ingest_source` | 0 | 4 | 5,362 |
| `extract_events` | 0 | 0 | 1,208 |
| `generate_briefing` | 0 | 0 | 48 |

**Read:** the runner is healthy. Job failure is not in the loss chain.

### Silent active sources

46 of 67 active sources flagged silent. As noted in §6, this number mixes truly-silent handles with false-silent live ones, so it is not directly actionable until the health classifier is debugged.

---

## Root cause ranking

| # | Root cause | Bucket / share affected | Estimated headroom |
|---|---|---|---|
| 1 | **Single-source funnel** — only ~12 sources contribute meaningfully; 5 named Telegram channels deactivated and not replaced; high-value T1 sources silent or never-posting (`@DefMon3`, `@GeoConfirmed`, `@UAWeapons`, `@Militarylandnet`, `@war_mapper`, `@Myanmar_OSINT`, `@SudanWarMonitor`). | 499 / 539 events (gate a) | **Largest by far.** If even 5–10 dormant T1 OSINT handles came back, the multi-source rate plausibly doubles or triples; verified could plausibly land at **5–10%**. |
| 2 | **Health classifier mislabeling** — `tass_rss`, `gdelt_iran`, `@neonhandrail` and others are posting within the hour but flagged silent; `@GeoConfirmed` has `last_post_at = NULL` despite delivering 1,696 posts in 7d. | Blocks accurate triage of #1 | **Preconditional.** Cannot prioritize source-revival until you know which "silent" sources are actually dead. |
| 3 | **3 erroring T1/T2 RSS feeds** — `isw_ukraine` (T1, Ukraine), `frontiermyanmar_rss` (T1, Myanmar), `tni_myanmar_rss` (T2, Myanmar). 34 consecutive errors each. | Removes high-trust corroboration inputs entirely, esp. for Myanmar (10 events / 7d, 0 verified) | Moderate. Fixing ISW alone restores a major T1 Ukraine signal that doesn't echo other channels. |
| 4 | **Platform monoculture in corroboration** — when corroboration does fire, 50% is same-platform (mostly Telegram-only). Verified requires ≥2 platforms by definition. | 20 / 40 multi-source events (gate b) | Modest in isolation; meaningful as a follow-on to #1 if revived sources are intentionally cross-platform. |
| 5 | **Strong-signal pass rate** — among multi-platform events, 50% clear verified; the rest fail on no geo / no official / no press. | 10 / 20 multi-platform events (gate c) | Genuinely hard. Probably the irreducible floor. |
| 6 | **Matcher under-merge** — only ~9% of single-source unconfirmed events have a mergeable peer in the dedup window. | ~42 events | **Negligible.** Skip. |
| 7 | **GDELT 95.5% skip** — confirmed but already absorbed; not a regression. | — | Negligible. The skip is by design (GDELT is mostly off-topic). |

---

## Recommended fix order (recommendations only — DO NOT implement in this pass)

1. **Debug the health classifier.** Until silent vs. truly-dead is distinguishable, source-revival is guesswork. Likely culprits: the nightly job that sets `health_status` is not consulting `last_post_at` (or is using a wrong window). Spot-check `tass_rss` first — clearly active, marked silent.
2. **Audit and revive (or formally retire) the 67-source active roster.** Specifically:
   - Reactivate or replace `warmonitor3`, `UAControlMap`, `UkrainianFront`, `IranIntl_En`, `irgcnews` (all `is_active=false`).
   - Fix the 3 erroring RSS feeds — ISW Ukraine is the highest-value single fix.
   - Investigate why these heavy-hitter handles never wrote `last_post_at`: `@DefMon3`, `@GeoConfirmed`, `@UAWeapons`, `@Militarylandnet`, `@war_mapper`, `@Myanmar_OSINT`, `@SudanWarMonitor`. The X ingestor may not be persisting timestamps, or these handles are silently failing auth/rate-limit.
3. **Add cross-platform sources for the underserved theaters.** Myanmar (10 events / 7d, 0 verified) and Sudan (9 events / 7d, 0 verified) lack RSS + wire diversity. Iran has IranIntl_En deactivated with no replacement.
4. **(Optional)** Persist strong-signal flags onto the events row (3 booleans + maybe the raw geo URL). Costs one migration but converts bucket (c) from inferred to measured — and exposes the LLM's failure modes for the next round of prompt tuning.
5. **Matcher / dedup**: no action this pass. Re-measure after #1–#3 land. Cross-type merging could be revisited as a model question, not a tuning question.

---

## Confidence + limits

- All numbers are from a single point-in-time read against Supabase `ugpqgfvdqupttqhogavc` on 2026-05-31 ~16:00 UTC.
- The 539-vs-499 gap between "all published 7d" and "sum across the 4 theater bboxes" (40 events) reflects events whose `location` falls outside every theater bbox — likely Russian-side cross-border events near the Ukraine bbox edge, or extraction errors. Not material to the conclusions.
- Bucket (c) is inferred, not measured (see §0). The conclusion that strong-signal is *not* the binding constraint depends on the recipe: rules-as-written + observed pass rate among multi-platform events (50%).
- "Verified rate could plausibly hit 5–10%" is a directional estimate, not a forecast — based on doubling the multi-source rate (the gate where almost all loss happens) while holding the multi-platform conversion and strong-signal pass rate constant at observed levels.
