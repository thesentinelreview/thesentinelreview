-- =============================================================================
-- 0012_add_sources_2026_05.sql
-- 1. Extend sources.platform CHECK to allow 'bluesky' and 'gdelt'.
-- 2. Refactor sources.theater TEXT → theaters TEXT[] (eliminates per-theater
--    row duplication for multi-theater sources like OFAC).
-- 3. Add events.relevance_score SMALLINT for LLM-emitted relevance metadata.
-- 4. Seed new sources: COCOM, OFAC, ISW, GDELT (events + GKG), Bluesky OSINT.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend platform CHECK constraint
-- ---------------------------------------------------------------------------

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_platform_check;
ALTER TABLE sources ADD CONSTRAINT sources_platform_check
    CHECK (platform IN ('x', 'telegram', 'rss', 'wire', 'bluesky', 'gdelt'));


-- ---------------------------------------------------------------------------
-- 2. theater TEXT → theaters TEXT[]
-- ---------------------------------------------------------------------------

ALTER TABLE sources ADD COLUMN theaters TEXT[];
UPDATE sources SET theaters = ARRAY[theater];
ALTER TABLE sources ALTER COLUMN theaters SET NOT NULL;
ALTER TABLE sources DROP COLUMN theater;


-- ---------------------------------------------------------------------------
-- 3. relevance_score on events
-- ---------------------------------------------------------------------------

ALTER TABLE events ADD COLUMN relevance_score SMALLINT;


-- ---------------------------------------------------------------------------
-- 4. Seed new sources
-- ---------------------------------------------------------------------------

-- COCOM combatant command press release feeds
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('centcom_iran',      'rss', 'CENTCOM',   1,
     'https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=1226&max=20',
     ARRAY['iran'],    true),
    ('centcom_sudan',     'rss', 'CENTCOM',   1,
     'https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=1226&max=20',
     ARRAY['sudan'],   true),
    ('eucom_ukraine',     'rss', 'EUCOM',     1,
     'https://www.eucom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=304&max=20',
     ARRAY['ukraine'], true),
    ('indopacom_myanmar', 'rss', 'INDOPACOM', 1,
     'https://www.pacom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=2&max=20',
     ARRAY['myanmar'], true);

-- OFAC — single row now possible with theaters[]
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('ofac_all', 'rss', 'OFAC', 1,
     'https://ofac.treasury.gov/recent-actions/feed',
     ARRAY['ukraine', 'iran', 'sudan', 'myanmar'], true);

-- Institute for the Study of War
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('isw_ukraine', 'rss', 'ISW', 1, 'https://www.understandingwar.org/rss.xml', ARRAY['ukraine'], true),
    ('isw_iran',    'rss', 'ISW', 1, 'https://www.understandingwar.org/rss.xml', ARRAY['iran'],    true);

-- GDELT 2.0 events database (no url — custom ingestor fetches from gdeltproject.org)
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('gdelt_ukraine', 'gdelt', 'GDELT', 2, NULL, ARRAY['ukraine'], true),
    ('gdelt_iran',    'gdelt', 'GDELT', 2, NULL, ARRAY['iran'],    true),
    ('gdelt_sudan',   'gdelt', 'GDELT', 2, NULL, ARRAY['sudan'],   true),
    ('gdelt_myanmar', 'gdelt', 'GDELT', 2, NULL, ARRAY['myanmar'], true);

-- GDELT Global Knowledge Graph (handle prefix distinguishes from events ingestor)
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('gdelt_gkg_ukraine', 'gdelt', 'GDELT GKG', 2, NULL, ARRAY['ukraine'], true),
    ('gdelt_gkg_iran',    'gdelt', 'GDELT GKG', 2, NULL, ARRAY['iran'],    true),
    ('gdelt_gkg_sudan',   'gdelt', 'GDELT GKG', 2, NULL, ARRAY['sudan'],   true),
    ('gdelt_gkg_myanmar', 'gdelt', 'GDELT GKG', 2, NULL, ARRAY['myanmar'], true);

-- Bluesky OSINT — Ukraine (handles verified prior to seeding)
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('nrgallant.bsky.social',     'bluesky', 'N.R. Gallant',  2, NULL, ARRAY['ukraine'], true),
    ('oryxspioenkop.bsky.social', 'bluesky', 'Oryx',          2, NULL, ARRAY['ukraine'], true),
    ('geoconfirmed.bsky.social',  'bluesky', 'GeoConfirmed',  2, NULL, ARRAY['ukraine'], true);

-- Bluesky OSINT — Iran / Sudan / Myanmar
-- is_active = false until handles are confirmed on bsky.app; flip via UPDATE once verified.
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active) VALUES
    ('iranintl.bsky.social',      'bluesky', 'Iran International', 2, NULL, ARRAY['iran'],    false),
    ('sudanwarchive.bsky.social', 'bluesky', 'Sudan War Archive',  2, NULL, ARRAY['sudan'],   false),
    ('myanmarnow.bsky.social',    'bluesky', 'Myanmar Now',        2, NULL, ARRAY['myanmar'], false);

COMMIT;
