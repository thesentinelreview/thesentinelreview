-- =============================================================================
-- 0022_social_sources_for_blocked_outlets.sql
--
-- Two RSS feeds are 403-blocked from the GitHub Actions runner IP:
--   - irrawaddy_rss    (The Irrawaddy, Myanmar)  tier 1
--   - sudantribune_rss (Sudan Tribune,  Sudan)   tier 2
-- Rather than build a fetch-egress proxy, follow the pattern that replaced ISW's
-- blocked feed (0013): add each outlet's official, live account as a source and
-- retire the dead RSS row. Neither outlet has an official Bluesky, so their
-- official English X accounts are the like-for-like replacement.
--
-- Reversible: flip is_active back to true on the *_rss rows if a live feed is
-- ever restored.
-- =============================================================================

BEGIN;

-- 1. Official social replacements for the IP-blocked outlets
INSERT INTO sources (handle, platform, display_name, trust_tier, url, theaters, is_active, notes)
VALUES
    ('@IrrawaddyNews', 'x', 'The Irrawaddy', 1,
     'https://x.com/IrrawaddyNews', ARRAY['myanmar'], true,
     'Official English X account of The Irrawaddy. Replaces irrawaddy_rss (https://www.irrawaddy.com/feed), 403-blocked from the Actions runner IP. Leading independent Myanmar outlet with deep resistance/EAO source networks.'),

    ('@SudanTribune_EN', 'x', 'Sudan Tribune', 2,
     'https://x.com/SudanTribune_EN', ARRAY['sudan'], true,
     'Official English X account of Sudan Tribune. Replaces sudantribune_rss (https://sudantribune.com/feed), 403-blocked from the Actions runner IP. Paris-based editorial team with local correspondents; treat with moderate caution (some single-sourced content).')
ON CONFLICT (handle) DO NOTHING;

-- 2. Retire the now-redundant dead RSS rows (a replacement was added for both)
UPDATE sources
SET is_active = false
WHERE handle IN ('irrawaddy_rss', 'sudantribune_rss');

COMMIT;
