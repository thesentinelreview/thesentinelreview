-- Fix stale occurred_at timestamps on recently-created events.
--
-- When the extractor ran without a post_timestamp fallback the LLM would guess
-- a date based on post content, often picking historical reference dates far in
-- the past. Any event created within the last 60 days whose occurred_at is more
-- than 30 days before its created_at is almost certainly a mis-extraction; set
-- occurred_at = created_at as a best-effort correction so the events are visible
-- in the dashboard's default 24h/7d time windows.

BEGIN;

UPDATE events
SET occurred_at = created_at
WHERE created_at  > now() - INTERVAL '60 days'
  AND occurred_at < created_at - INTERVAL '30 days';

COMMIT;
