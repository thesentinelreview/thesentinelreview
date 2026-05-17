-- Backfill published_at for events that were inserted before the insert_event
-- fix (commit bd7c6d4). The old code never set published_at, leaving it NULL
-- on every row. All dashboard queries filter WHERE published_at IS NOT NULL,
-- so the dashboard fell back to placeholder data for the entire deployment.
--
-- Fix: set published_at = created_at for events that are not held for review.
-- Events held for review are left NULL intentionally (they need human approval).

BEGIN;

UPDATE events
SET published_at = created_at
WHERE held_for_review = false
  AND published_at IS NULL;

COMMIT;
