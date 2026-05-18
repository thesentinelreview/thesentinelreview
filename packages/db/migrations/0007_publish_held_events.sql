-- 0007_publish_held_events.sql
-- The dashboard runs autonomously; held_for_review is no longer used.
-- Publish all currently held events and clear the flag.

BEGIN;

UPDATE events
SET
    published_at   = COALESCE(published_at, created_at),
    held_for_review = false
WHERE held_for_review = true;

COMMIT;
