-- =============================================================================
-- 0013_seed_bsky_osint_sources.sql
-- Seed the 34 curated Bluesky handles discovered by bsky-osint into sources.
--
-- Source: apps/bsky-osint/data/seed_handles.csv
--
-- trust_tier mapping:
--   researcher / osint / journalist / local_media → 2 (medium)
--   aggregator / government                       → 3 (low)
--
-- is_active:
--   *.bsky.social handles → true  (handle format guarantees they're on Bluesky)
--   domain handles        → false (need manual verification that a DID is registered)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Ukraine theater
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active, notes)
VALUES
    ('thestudyofwar.bsky.social', 'bluesky', 'The Study of War (ISW)', 2,
     NULL, ARRAY['ukraine', 'iran'], true,
     'ISW-style war and security analysis'),

    ('bellingcat.com', 'bluesky', 'Bellingcat', 2,
     NULL, ARRAY['ukraine', 'myanmar', 'iran'], false,
     'Open-source investigations and verification. Domain handle — verify DID before activating.'),

    ('osinttechnical.bsky.social', 'bluesky', 'OSINT Technical', 2,
     NULL, ARRAY['ukraine', 'iran', 'sudan', 'myanmar'], true,
     'Conflict and military OSINT'),

    ('rebel44cz.bsky.social', 'bluesky', 'Rebel44CZ', 2,
     NULL, ARRAY['ukraine'], true,
     'Ukraine war losses and military OSINT'),

    ('covertshores.bsky.social', 'bluesky', 'Covert Shores', 2,
     NULL, ARRAY['ukraine', 'iran'], true,
     'Naval and defense analysis'),

    ('paulmcleary.bsky.social', 'bluesky', 'Paul McLeary', 2,
     NULL, ARRAY['ukraine', 'iran'], true,
     'U.S. defense and national security reporting'),

    ('rhfontaine.bsky.social', 'bluesky', 'R.H. Fontaine', 2,
     NULL, ARRAY['ukraine'], true,
     'U.S. national security policy analysis'),

    ('liveuamap.com', 'bluesky', 'LiveUAMap', 3,
     NULL, ARRAY['ukraine'], false,
     'Useful for event discovery. Domain handle — verify DID before activating.'),

    ('kyivindependent.com', 'bluesky', 'Kyiv Independent', 2,
     NULL, ARRAY['ukraine'], false,
     'Ukrainian reporting in English. Domain handle — verify DID before activating.'),

    ('pravda.ua', 'bluesky', 'Ukrainska Pravda', 2,
     NULL, ARRAY['ukraine'], false,
     'Ukrainian news source. Domain handle — verify DID before activating.'),

    ('defense-of-ukraine.bsky.social', 'bluesky', 'Defense of Ukraine', 3,
     NULL, ARRAY['ukraine'], true,
     'Verify authenticity before relying on it'),

    ('uacontrolmap.bsky.social', 'bluesky', 'UA Control Map', 2,
     NULL, ARRAY['ukraine'], true,
     'Frontline/geolocation-oriented updates'),

    ('osintukraine.com', 'bluesky', 'OSINT Ukraine', 2,
     NULL, ARRAY['ukraine'], false,
     'Ukraine-focused OSINT. Domain handle — verify DID before activating.'),

    ('newsfeedukraine.bsky.social', 'bluesky', 'Newsfeed Ukraine', 3,
     NULL, ARRAY['ukraine'], true,
     'Ukraine news aggregation'),

    ('imatv.bsky.social', 'bluesky', 'IMA TV', 2,
     NULL, ARRAY['ukraine'], true,
     'Local Ukraine reporting perspective'),

    ('lapatina.bsky.social', 'bluesky', 'Lapatina', 2,
     NULL, ARRAY['ukraine'], true,
     'Ukraine/national security context')

ON CONFLICT (handle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Iran theater
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active, notes)
VALUES
    ('shayan86.bsky.social', 'bluesky', 'Shayan Sardarizadeh', 2,
     NULL, ARRAY['iran'], true,
     'Iran protest verification and disinformation context'),

    ('ntabrizy.bsky.social', 'bluesky', 'Nariman Tabrizy', 2,
     NULL, ARRAY['iran'], true,
     'Visual verification and Iran-related reporting'),

    ('smohyeddin.bsky.social', 'bluesky', 'S. Mohyeddin', 2,
     NULL, ARRAY['iran'], true,
     'Iran-related journalism/commentary'),

    ('warmonitor.net', 'bluesky', 'War Monitor', 3,
     NULL, ARRAY['ukraine', 'iran', 'sudan'], false,
     'Verify against primary sources before high-confidence use. Domain handle — verify DID before activating.')

ON CONFLICT (handle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sudan theater
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active, notes)
VALUES
    ('matnashed.bsky.social', 'bluesky', 'Mat Nashed', 2,
     NULL, ARRAY['sudan'], true,
     'Sudan reporting'),

    ('lighthousereports.com', 'bluesky', 'Lighthouse Reports', 2,
     NULL, ARRAY['sudan', 'ukraine'], false,
     'OSINT/investigative reporting. Domain handle — verify DID before activating.'),

    ('wammezz.bsky.social', 'bluesky', 'Wammezz', 2,
     NULL, ARRAY['sudan', 'ukraine'], true,
     'Conflict drone warfare research'),

    ('unishka.bsky.social', 'bluesky', 'Unishka', 2,
     NULL, ARRAY['sudan'], true,
     'Sudan OSINT and corruption research'),

    ('bechamilton.bsky.social', 'bluesky', 'Bec Hamilton', 2,
     NULL, ARRAY['sudan'], true,
     'Atrocity prevention and Sudan policy context'),

    ('emadbadi.bsky.social', 'bluesky', 'Emad Badi', 2,
     NULL, ARRAY['sudan', 'iran'], true,
     'Libya/UAE/Sudan regional conflict links'),

    ('c4ads.org', 'bluesky', 'C4ADS', 2,
     NULL, ARRAY['sudan', 'iran'], false,
     'Conflict finance and illicit networks. Domain handle — verify DID before activating.')

ON CONFLICT (handle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Myanmar theater
-- ---------------------------------------------------------------------------

INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active, notes)
VALUES
    ('myanmar-now.bsky.social', 'bluesky', 'Myanmar Now', 2,
     NULL, ARRAY['myanmar'], true,
     'Myanmar news'),

    ('frontiermyanmar.bsky.social', 'bluesky', 'Frontier Myanmar', 2,
     NULL, ARRAY['myanmar'], true,
     'Myanmar conflict and political reporting'),

    ('dvbenglish.bsky.social', 'bluesky', 'DVB English', 2,
     NULL, ARRAY['myanmar'], true,
     'Myanmar news'),

    ('gbutensky.bsky.social', 'bluesky', 'G. Butensky', 2,
     NULL, ARRAY['myanmar'], true,
     'Burma/Myanmar-focused OSINT account'),

    ('eoghanmacguire.bsky.social', 'bluesky', 'Eoghan Mac Guire', 2,
     NULL, ARRAY['myanmar'], true,
     'Bellingcat editor Myanmar airstrike/OSINT coverage'),

    ('kasperhoffmann.bsky.social', 'bluesky', 'Kasper Hoffmann', 2,
     NULL, ARRAY['myanmar'], true,
     'Armed conflict and resource/conflict research')

ON CONFLICT (handle) DO NOTHING;

COMMIT;
