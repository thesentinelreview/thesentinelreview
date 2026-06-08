-- =============================================================================
-- 0023_add_has_strong_signal_to_events.sql
--
-- Persists whether an event carries a "strong signal" — any single corroborating
-- indicator the extractor detects (geolocated footage, given coordinates, visible
-- landmarks, official acknowledgment, or matching press). The confidence scorer
-- requires a strong signal to reach `verified`.
--
-- Before this column the flag was ephemeral: computed at extraction, used once,
-- then discarded. The corroboration re-score therefore had to GUESS it from the
-- event's current confidence (`confidence != 'unconfirmed'`), so an event whose
-- first source lacked a signal could never become `verified` no matter how many
-- cross-platform sources later attached. Persisting it lets the re-score recover
-- the flag deterministically and OR in each corroborating source's signal.
--
-- ADD COLUMN of a NOT NULL column with a CONSTANT default is metadata-only on
-- Postgres 11+ (the default is recorded in the catalog; no table rewrite) and is
-- legal inside migrate.py's single-transaction apply.
--
-- Seed: mark every currently-`verified` event as carrying a strong signal. Under
-- the scorer's rules `verified` is reachable ONLY with one, so this is exact, and
-- it prevents a transient demotion if a no-signal source corroborates a verified
-- event between this migration and the confidence backfill. It does NOT recover
-- signals already collapsed into `unconfirmed`/`partial` events (never stored) —
-- the confidence backfill (sentinel-run-backfill-confidence) reconstructs the rest
-- from event structure; the genuinely-unrecoverable cases can only reach
-- `verified` forward, when a new strong-signal source attaches.
--
-- Reversible:
--   ALTER TABLE events DROP COLUMN IF EXISTS has_strong_signal;
-- =============================================================================

BEGIN;

ALTER TABLE events ADD COLUMN has_strong_signal boolean NOT NULL DEFAULT false;

UPDATE events SET has_strong_signal = true WHERE confidence = 'verified';

COMMIT;
