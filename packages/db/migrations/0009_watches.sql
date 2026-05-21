-- =============================================================================
-- 0009_watches.sql
-- Per-user watchlist. A user "watches" a raw post from the Source Feed and is
-- later shown when Sentinel View confirms it (i.e. the post gets linked to a
-- published, geocoded event). clerk_user_id is the identity key, mirroring
-- user_subscriptions.
-- =============================================================================

BEGIN;

CREATE TABLE watches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  TEXT        NOT NULL,
  raw_post_id    UUID        NOT NULL REFERENCES raw_posts(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, raw_post_id)
);

CREATE INDEX watches_clerk_user_idx ON watches (clerk_user_id);
CREATE INDEX watches_raw_post_idx   ON watches (raw_post_id);

COMMIT;
