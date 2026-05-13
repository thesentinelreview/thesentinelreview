-- =============================================================================
-- seed/iran_sources.sql
-- Curated source seed list for Iran theater — v0.1
-- Run AFTER 0002_add_theater_to_sources.sql migration.
--
-- trust_tier:
--   1 = high   — independent verified outlets, wire services
--   2 = medium — established regional press with editorial standards
--   3 = low    — state-affiliated, single contributors, IO risk
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- RSS feeds — active immediately, no credentials required
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, theater, notes) VALUES
(
    'iranintl_rss',
    'rss',
    'Iran International',
    'https://www.iranintl.com/en/rss',
    1,
    'iran',
    'Leading English-language Iranian opposition outlet. Strong editorial standards. Covers nuclear program, IRGC operations, proxy activity. Equivalent to Kyiv Independent for Ukraine.'
),
(
    'radiofarda_rss',
    'rss',
    'Radio Farda',
    'https://www.rferl.org/api/zpqovil-pm',
    1,
    'iran',
    'RFE/RL Persian service. US government-funded. Rigorous editorial standards. Strong Iran domestic and nuclear coverage. Equivalent to Radio Svoboda for Ukraine.'
),
(
    'reuters_mideast_rss',
    'rss',
    'Reuters Middle East',
    'https://feeds.reuters.com/Reuters/worldNews',
    1,
    'iran',
    'Reuters wire filtered to Middle East/Iran events. Wire accuracy standards. Best for confirmed strikes and nuclear developments.'
),
(
    'tasnimnews_rss',
    'rss',
    'Tasnim News (monitor only)',
    'https://www.tasnimnews.com/en/rss',
    3,
    'iran',
    'Iranian state news agency. Equivalent to TASS. Official IRGC and government positions. Ingest for corroboration research only. Every claim requires independent verification. High IO risk.'
);

-- ---------------------------------------------------------------------------
-- Telegram channels — active when TELEGRAM_API_ID/HASH/SESSION are set
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, theater, notes) VALUES
(
    'IranIntl_En',
    'telegram',
    'Iran International (Telegram)',
    'https://t.me/IranIntl_En',
    1,
    'iran',
    'Telegram mirror of Iran International. Higher posting cadence than RSS. Covers breaking developments on nuclear sites, IRGC operations, regional proxy attacks.'
),
(
    'RadioFardaNews',
    'telegram',
    'Radio Farda (Telegram)',
    'https://t.me/RadioFardaNews',
    1,
    'iran',
    'Telegram channel of Radio Farda. Breaking Iran news in English and Persian. Good for official statements and protests/unrest.'
),
(
    'tasnimnews_en',
    'telegram',
    'Tasnim News English (Telegram)',
    'https://t.me/tasnimnews_en',
    3,
    'iran',
    'Iranian state Tasnim News English Telegram. Primary source for official Iranian government and IRGC claims. Monitor only — treat all military claims as unverified without cross-referencing.'
),
(
    'irgcnews_ir',
    'telegram',
    'IRGC News',
    'https://t.me/irgcnews',
    3,
    'iran',
    'IRGC-affiliated channel. Equivalent to Russian MoD channel for Ukraine. Official primary source for IRGC operations and claims. High IO risk — use for signal detection only, never as sole source.'
);

COMMIT;
