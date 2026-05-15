-- =============================================================================
-- seed/sudan_myanmar_sources.sql
-- Curated source seed list for Sudan and Myanmar theaters — v0.1
--
-- trust_tier:
--   1 = high   — wire services, established specialist outlets
--   2 = medium — regional press, conflict-focused monitors with editorial standards
--   3 = low    — anonymous channels, state-affiliated, single contributors
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Sudan theater sources
-- Conflict: SAF (Sudanese Armed Forces) vs RSF (Rapid Support Forces)
-- Key regions: Khartoum, North Darfur (El Fasher), South Kordofan, Blue Nile
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, theater, notes) VALUES
(
    'sudanwarmonitor_rss',
    'rss',
    'Sudan War Monitor',
    'https://sudanwarmonitor.com/feed',
    1,
    'sudan',
    'Specialist conflict monitor tracking SAF/RSF fighting. Maps front lines and reports on humanitarian access. High methodological transparency.'
),
(
    'reuters_africa_rss',
    'rss',
    'Reuters Africa',
    'https://feeds.reuters.com/reuters/AFRICANews',
    1,
    'sudan',
    'Reuters Africa wire. Covers Sudan extensively; correspondents in Port Sudan and Cairo. Strong editorial verification standards.'
),
(
    'afp_africa_rss',
    'rss',
    'AFP Africa',
    'https://www.afp.com/en/rss-feeds',
    1,
    'sudan',
    'AFP Africa bureau. Reliable wire coverage with on-ground stringers. Cross-reference against Reuters for verification.'
),
(
    '@SudanWarMonitor',
    'x',
    'Sudan War Monitor',
    'https://x.com/SudanWarMonitor',
    1,
    'sudan',
    'Real-time updates from Sudan War Monitor team. Breaks developments before RSS publication. Primary rapid-alert source.'
),
(
    'ayin_rss',
    'rss',
    'Ayin Network',
    'https://ayin.network/feed',
    2,
    'sudan',
    'Independent Sudan-focused outlet covering conflict and humanitarian issues. Strong Blue Nile and Kordofan coverage.'
),
(
    '@RadioDabaanga',
    'x',
    'Radio Dabanga',
    'https://x.com/RadioDabanga',
    2,
    'sudan',
    'Darfur-focused radio network with correspondents across conflict zones. Strong on El Fasher and North Darfur reporting.'
),
(
    'sudantribune_rss',
    'rss',
    'Sudan Tribune',
    'https://sudantribune.com/feed',
    2,
    'sudan',
    'Long-running Sudan news outlet. Paris-based editorial team with local correspondents. Treat with moderate caution — some content is single-sourced.'
);

-- ---------------------------------------------------------------------------
-- Myanmar theater sources
-- Conflict: PDF (People''s Defence Force) / ethnic armed organisations vs Tatmadaw/SAC junta
-- Key regions: Sagaing, Shan State, Karen/Kayin State, Chin State, Rakhine
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, url, trust_tier, theater, notes) VALUES
(
    'dvb_rss',
    'rss',
    'Democratic Voice of Burma',
    'https://english.dvb.no/feed',
    1,
    'myanmar',
    'Oldest independent Myanmar broadcaster. Oslo-based with extensive local correspondent network. Strong on military operations and civilian casualties.'
),
(
    'irrawaddy_rss',
    'rss',
    'The Irrawaddy',
    'https://www.irrawaddy.com/feed',
    1,
    'myanmar',
    'Leading independent Myanmar news outlet. Thailand-based with deep source networks across resistance and ethnic armed organisations.'
),
(
    'frontiermyanmar_rss',
    'rss',
    'Frontier Myanmar',
    'https://www.frontiermyanmar.net/en/feed',
    1,
    'myanmar',
    'English-language investigative outlet. Strong methodological standards. Particularly good on Yangon and central Myanmar.'
),
(
    '@Myanmar_OSINT',
    'x',
    'Myanmar OSINT',
    'https://x.com/Myanmar_OSINT',
    1,
    'myanmar',
    'Dedicated geolocation and OSINT account for Myanmar conflict. Cross-references footage with satellite imagery. High accuracy on territorial claims.'
),
(
    'rfa_myanmar_rss',
    'rss',
    'Radio Free Asia — Myanmar',
    'https://www.rfa.org/burmese/rss2.xml',
    2,
    'myanmar',
    'RFA Burmese service. Local-language sourcing translated to English. Strong on Sagaing and northwest Myanmar. US govt-funded — note for editorial context.'
),
(
    'mizzima_rss',
    'rss',
    'Mizzima News',
    'https://mizzima.com/taxonomy/term/25/feed',
    2,
    'myanmar',
    'India-based Myanmar exile media. Broad coverage; verification standards are medium — corroborate before upgrading confidence.'
),
(
    'tni_myanmar_rss',
    'rss',
    'Transnational Institute — Myanmar',
    'https://www.tni.org/rss/myanmar',
    2,
    'myanmar',
    'Policy and conflict analysis focused on ethnic armed organisations. Slower cadence than news outlets but useful for territorial and political context.'
);

COMMIT;
