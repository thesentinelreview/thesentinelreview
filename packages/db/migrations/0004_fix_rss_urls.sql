-- Fix broken and dead RSS source URLs.
-- Reuters killed their legacy Feedburner RSS in 2020.
-- AFP has no public RSS. RSSHub was blocking Railway's IP range.
-- ayin.network domain has expired.
-- Ukrinform changed their RSS path.

BEGIN;

-- Replace dead Reuters feeds with BBC equivalents
UPDATE sources SET
    url          = 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
    display_name = 'BBC World — Europe',
    notes        = 'BBC World Service Europe coverage. Reliable Ukraine conflict reporting.'
WHERE handle = 'reuters_ukraine_rss';

UPDATE sources SET
    url          = 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    display_name = 'BBC World — Africa',
    notes        = 'BBC World Service Africa coverage. Covers Sudan conflict and humanitarian situation.'
WHERE handle = 'reuters_africa_rss';

-- Replace AP via rsshub proxy (blocked) with direct AP RSS
UPDATE sources SET
    url = 'https://feeds.apnews.com/apnews/worldnews'
WHERE handle = 'ap_ukraine_rss';

-- Replace dead AFP feeds with working alternatives
UPDATE sources SET
    url          = 'https://www.pravda.com.ua/eng/rss/',
    display_name = 'Ukrainska Pravda (English)',
    notes        = 'Major independent Ukrainian outlet. Strong front-line and political coverage.'
WHERE handle = 'afp_ukraine_rss';

UPDATE sources SET
    url          = 'https://www.dabangasudan.org/en/feed',
    display_name = 'Radio Dabanga',
    notes        = 'Sudan-focused independent radio. Strong Darfur/El Fasher coverage with local correspondents.'
WHERE handle = 'afp_africa_rss';

-- Fix broken Ukrinform RSS path
UPDATE sources SET
    url = 'https://www.ukrinform.net/rss/block-chronika'
WHERE handle = 'ukrinform_rss';

-- Disable dead Interfax Ukraine URL (we have other Ukraine wire sources)
UPDATE sources SET
    is_active = false
WHERE handle = 'interfax_ukraine_rss';

-- Replace expired ayin.network domain with ReliefWeb Sudan
UPDATE sources SET
    url          = 'https://reliefweb.int/country/sdn/rss.xml',
    display_name = 'ReliefWeb — Sudan',
    notes        = 'UN OCHA humanitarian data. Sudan crisis situation reports and updates.'
WHERE handle = 'ayin_rss';

COMMIT;
