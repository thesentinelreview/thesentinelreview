-- =============================================================================
-- seed/sources.sql
-- Curated source seed list for Ukraine theater — v0.1
-- ~35 accounts/feeds across X, Telegram, RSS, and wire services.
--
-- trust_tier:
--   1 = high   — wire services, long-track geolocation specialists
--   2 = medium — established milblogs, regional press with editorial standards
--   3 = low    — anonymous channels, state-affiliated outlets, single contributors
--
-- NOTE: This list is a starting point. Jacob to review and finalize per the
-- open decision in the handoff doc (section 9).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- X / Twitter — Geolocation and OSINT specialists (tier 1)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    '@DefMon3',
    'x',
    'DefMon3',
    'https://x.com/DefMon3',
    1,
    'Long-running Ukraine geolocation account. Cross-references footage with satellite imagery. High historical accuracy.'
),
(
    '@GeoConfirmed',
    'x',
    'GeoConfirmed',
    'https://x.com/GeoConfirmed',
    1,
    'Specialist geolocation community. Documents methodology publicly. Treats unconfirmed claims with explicit labels.'
),
(
    '@OSINTtechnical',
    'x',
    'OSINT Technical',
    'https://x.com/OSINTtechnical',
    1,
    'Weapons identification and battlefield analysis. Rarely posts without corroborating evidence.'
),
(
    '@UAWeapons',
    'x',
    'UAWeapons',
    'https://x.com/UAWeapons',
    1,
    'Weapons and equipment tracking. Provides model identification and theatre provenance.'
),
(
    '@war_mapper',
    'x',
    'War Mapper',
    'https://x.com/war_mapper',
    1,
    'Daily frontline maps based on geolocated events. Transparent sourcing in thread replies.'
);

-- ---------------------------------------------------------------------------
-- X / Twitter — Analysis and monitoring (tier 2)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    '@Militarylandnet',
    'x',
    'Militaryland.net',
    'https://x.com/Militarylandnet',
    2,
    'Czech analytical project tracking frontline changes. Publishes daily maps. Commercial-grade sourcing.'
),
(
    '@TheStudyofWar',
    'x',
    'ISW (Institute for the Study of War)',
    'https://x.com/TheStudyofWar',
    2,
    'US think-tank. Daily Ukraine assessments widely cited. Openly funded; editorial independence is strong. Slower cadence.'
),
(
    '@KofmanMichael',
    'x',
    'Michael Kofman',
    'https://x.com/KofmanMichael',
    2,
    'Senior Russian military analyst at CNA. Analytical commentary; not a real-time feed. High signal-to-noise.'
),
(
    '@ChrisO_wiki',
    'x',
    'ChrisO',
    'https://x.com/ChrisO_wiki',
    2,
    'Long-form research and document analysis. Slow cadence, high accuracy.'
),
(
    '@neonhandrail',
    'x',
    'Neonhandrail',
    'https://x.com/neonhandrail',
    2,
    'Frontline mapping and visual confirmation thread aggregator.'
),
(
    '@RALee85',
    'x',
    'Rob Lee',
    'https://x.com/RALee85',
    2,
    'Military analyst. Focused on equipment losses and operational analysis. Peer-reviewed commentary.'
),
(
    '@Danspiun',
    'x',
    'Dan (OSINT Ukraine)',
    'https://x.com/Danspiun',
    2,
    'High-volume Ukraine monitoring. Aggregates from multiple Telegram channels; apply corroboration filter.'
);

-- ---------------------------------------------------------------------------
-- Telegram — Ukrainian and international channels (tier 2)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    'DeepStateUA',
    'telegram',
    'DeepState UA',
    'https://t.me/deepstateUA',
    2,
    'Ukrainian analytical channel. Real-time frontline maps. Broadly trusted but Ukrainian-perspective bias. Cross-check.'
),
(
    'UkrainianFront',
    'telegram',
    'Ukrainian Front',
    'https://t.me/ukrainianfront',
    2,
    'Aggregates reports from Ukrainian military units. Pro-Ukrainian; verify casualty/equipment claims against other sources.'
),
(
    'UkrWarReport',
    'telegram',
    'Ukraine War Report',
    'https://t.me/ukrainewar_report',
    2,
    'Bilingual (EN/UA) channel. Moderate posting rate. Generally accurate on geolocated strikes.'
),
(
    'Militaryland_net_tg',
    'telegram',
    'Militaryland (Telegram)',
    'https://t.me/militaryland',
    2,
    'Telegram mirror of Militaryland.net. Faster cadence than X account.'
),
(
    'UAControlMap',
    'telegram',
    'UA Control Map',
    'https://t.me/uacontrolmap',
    2,
    'Daily interactive control map updates. Derived from multiple sources; apply single-source caution.'
);

-- ---------------------------------------------------------------------------
-- Telegram — Russian-language milblogs (tier 3)
-- Watch for information operations. High volume, lower verification rate.
-- Treat as signal for corroboration only, never as primary.
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    'Rybar_tg',
    'telegram',
    'Rybar',
    'https://t.me/rybar',
    3,
    'High-follower Russian milblog. Often first to report Russian advances. Significant pro-Russian bias and IO risk. Corroboration only.'
),
(
    'WarGonzo_tg',
    'telegram',
    'WarGonzo',
    'https://t.me/wargonzo',
    3,
    'Russian journalist account. Front-line video, but embedded with Russian forces. One-sided perspective. Low confidence default.'
),
(
    'TwoMajors_tg',
    'telegram',
    'Two Majors',
    'https://t.me/dva_majors',
    3,
    'Aggregates Russian military claims. Propagandistic framing. Use only to identify claimed events for separate verification.'
),
(
    'WarMonitor_tg',
    'telegram',
    'War Monitor',
    'https://t.me/warmonitor3',
    3,
    'Claims to aggregate both sides. In practice leans pro-Russian. Apply heavy skepticism to casualty figures.'
);

-- ---------------------------------------------------------------------------
-- Wire services — RSS feeds (tier 1)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    'reuters_ukraine_rss',
    'rss',
    'BBC World — Europe',
    'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
    1,
    'BBC World Service Europe coverage. Reliable Ukraine conflict reporting.'
),
(
    'ap_ukraine_rss',
    'rss',
    'AP Ukraine',
    'https://feeds.apnews.com/apnews/worldnews',
    1,
    'AP Newswire Ukraine coverage. Verified before publish. Cite freely.'
),
(
    'afp_ukraine_rss',
    'rss',
    'Ukrainska Pravda (English)',
    'https://www.pravda.com.ua/eng/rss/',
    1,
    'Major independent Ukrainian outlet. Strong front-line and political coverage.'
);

-- ---------------------------------------------------------------------------
-- Local press — RSS/wire (tier 2)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    'ukrinform_rss',
    'rss',
    'Ukrinform',
    'https://www.ukrinform.net/rss/block-chronika',
    2,
    'Ukrainian state news agency. Pro-Ukrainian framing on operational matters but generally accurate on confirmed incidents. Distinguish confirmed from claimed.'
),
(
    'kyivindependent_rss',
    'rss',
    'Kyiv Independent',
    'https://kyivindependent.com/feed',
    2,
    'English-language Ukrainian investigative outlet. Strong editorial standards. Not a real-time feed; best for context and corroboration.'
),
(
    'meduza_rss',
    'rss',
    'Meduza',
    'https://meduza.io/rss/en/all',
    2,
    'Russian independent outlet (Latvia-based). Anti-war editorial line. Useful for Russian domestic reporting and Kremlin statements. Treat military claims with standard skepticism.'
),
(
    'interfax_ukraine_rss',
    'rss',
    'Interfax Ukraine',
    'https://kyivpost.com/feed',
    2,
    'Private Ukrainian wire. Often cites official sources directly. Use for official Ukrainian military statements.'
),
(
    'unian_rss',
    'rss',
    'UNIAN',
    'https://www.unian.info/rss',
    2,
    'Ukrainian news agency. Good for official announcements and SBU/Armed Forces press releases.'
),
(
    'tass_rss',
    'rss',
    'TASS (monitor only)',
    'https://tass.com/rss/v2.xml',
    3,
    'Russian state news. Official Kremlin and MoD positions. Ingest for corroboration research only. Every claim requires independent verification. High IO risk.'
);

-- ---------------------------------------------------------------------------
-- ACLED integration (tier 1 — special case: structured data, not posts)
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, notes) VALUES
(
    'acled_api',
    'rss',
    'ACLED (Armed Conflict Location & Event Data)',
    'https://acleddata.com/data-export-tool/',
    1,
    'Structured event database. Used for backfill and cross-validation, not real-time ingestion. ACLED methodology is public and peer-reviewed. Lag: typically 1–7 days. Store ACLED event_id in raw_posts.external_id for deduplication.'
);

COMMIT;
