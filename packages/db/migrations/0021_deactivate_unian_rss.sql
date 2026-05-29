-- =============================================================================
-- 0021_deactivate_unian_rss.sql
--
-- Deactivates unian_rss: the source is dead at the origin. The configured legacy
-- feed (https://www.unian.info/rss) pulls 100 raw entries that are all dropped
-- too_old even at the widened 24h look-back, and the candidate English feed
-- (https://rss.unian.net/site/news_eng.rss) is also dead. With no live feed to
-- repoint to, deactivate the source so it stops inflating the silent-source
-- warning rather than sitting active-but-empty. Ukraine RSS coverage stays
-- healthy via ukrinform, kyivindependent, interfax_ukraine, and meduza.
--
-- Reversible: flip is_active back to true if a live feed is found.
-- =============================================================================

BEGIN;

UPDATE sources
SET is_active = false
WHERE handle = 'unian_rss';

COMMIT;
