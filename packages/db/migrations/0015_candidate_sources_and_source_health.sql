-- =============================================================================
-- 0015_candidate_sources_and_source_health.sql
--
-- Backfills schema that was applied to the live DB directly (via Supabase MCP)
-- during Phase A source discovery (#102) and the source-health work, but never
-- mirrored into packages/db/migrations/. Without this, a database rebuilt purely
-- from in-repo migrations (preview branch, fresh dev env, disaster recovery)
-- lacks these objects and both /admin/sources and discover_candidates.py fail.
--
-- Fully idempotent: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- and catalog-guarded ADD CONSTRAINT. No-ops on production (which already has
-- everything) and fully provisions a fresh database.
--
-- NOTE on RLS: this reproduces the live state exactly. candidate_sources and
-- candidate_mentions currently have RLS *disabled* (sources has it enabled).
-- That asymmetry looks like an oversight from the ad-hoc table creation; if it
-- should be hardened, do it in a separate, intentional migration that also
-- applies to production — not here, where the contract is "no-op on prod".
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. candidate_sources — discovered-but-unreviewed source candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_sources (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle                      text NOT NULL,
    platform                    text NOT NULL,
    display_name                text,
    url                         text,
    suggested_theaters          text[],
    discovery_method            text NOT NULL,
    discovery_context           jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                      text NOT NULL DEFAULT 'discovered',
    mention_count               integer NOT NULL DEFAULT 0,
    first_seen_at               timestamptz NOT NULL DEFAULT now(),
    last_seen_at                timestamptz NOT NULL DEFAULT now(),
    shadow_source_id            uuid REFERENCES sources(id) ON DELETE SET NULL,
    shadow_started_at           timestamptz,
    shadow_ended_at             timestamptz,
    posts_in_shadow             integer NOT NULL DEFAULT 0,
    events_extracted_in_shadow  integer NOT NULL DEFAULT 0,
    events_corroborating        integer NOT NULL DEFAULT 0,
    events_originating          integer NOT NULL DEFAULT 0,
    events_orphaned             integer NOT NULL DEFAULT 0,
    posts_skipped_in_shadow     integer NOT NULL DEFAULT 0,
    corroboration_rate          numeric,
    noise_rate                  numeric,
    reviewed_at                 timestamptz,
    reviewer_notes              text,
    rejection_reason            text,
    promoted_source_id          uuid REFERENCES sources(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT candidate_sources_platform_handle_key UNIQUE (platform, handle),
    CONSTRAINT candidate_sources_discovery_method_check
        CHECK (discovery_method IN ('mention_mining', 'follower_graph', 'catalog_scrape', 'manual')),
    CONSTRAINT candidate_sources_platform_check
        CHECK (platform IN ('x', 'telegram', 'bluesky', 'rss', 'gdelt')),
    CONSTRAINT candidate_sources_status_check
        CHECK (status IN ('discovered', 'shadow_pending', 'shadow_active', 'shadow_complete',
                          'approved', 'rejected', 'auto_rejected', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_cs_status
    ON candidate_sources (status);
CREATE INDEX IF NOT EXISTS idx_cs_review_queue
    ON candidate_sources (mention_count DESC, last_seen_at DESC)
    WHERE status IN ('discovered', 'shadow_complete');
CREATE INDEX IF NOT EXISTS idx_cs_shadow_active
    ON candidate_sources (shadow_started_at)
    WHERE status = 'shadow_active';

-- ---------------------------------------------------------------------------
-- 2. candidate_mentions — per-mention evidence backing each candidate
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_mentions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id            uuid NOT NULL REFERENCES candidate_sources(id) ON DELETE CASCADE,
    mentioning_source_id    uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    mentioning_post_id      uuid REFERENCES raw_posts(id) ON DELETE SET NULL,
    mention_type            text NOT NULL,
    mention_context         text,
    observed_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT candidate_mentions_candidate_id_mentioning_source_id_mentio_key
        UNIQUE (candidate_id, mentioning_source_id, mentioning_post_id, mention_type),
    CONSTRAINT candidate_mentions_mention_type_check
        CHECK (mention_type IN ('at_mention', 'link', 'quote_repost', 'rss_outbound'))
);

CREATE INDEX IF NOT EXISTS idx_cm_candidate
    ON candidate_mentions (candidate_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_source
    ON candidate_mentions (mentioning_source_id);

-- ---------------------------------------------------------------------------
-- 3. sources — health-monitoring + shadow-evaluation columns
-- ---------------------------------------------------------------------------
ALTER TABLE sources ADD COLUMN IF NOT EXISTS evaluation_status      text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS evaluation_started_at  timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS health_status          text NOT NULL DEFAULT 'unknown';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_post_at           timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_errors     integer NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_error_at          timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_error_message     text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS flagged_for_review_at  timestamptz;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS flagged_reason         text;

-- ADD CONSTRAINT has no IF NOT EXISTS — guard via the catalog so this no-ops on prod.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sources_health_status_check'
          AND conrelid = 'public.sources'::regclass
    ) THEN
        ALTER TABLE sources ADD CONSTRAINT sources_health_status_check
            CHECK (health_status IN ('unknown', 'healthy', 'silent', 'erroring',
                                     'handle_invalid', 'url_broken'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sources_evaluation_status_check'
          AND conrelid = 'public.sources'::regclass
    ) THEN
        ALTER TABLE sources ADD CONSTRAINT sources_evaluation_status_check
            CHECK (evaluation_status IS NULL OR evaluation_status IN ('shadow', 'production'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sources_health
    ON sources (health_status)
    WHERE health_status <> 'healthy';
CREATE INDEX IF NOT EXISTS idx_sources_evaluation_status
    ON sources (evaluation_status)
    WHERE evaluation_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_flagged
    ON sources (flagged_for_review_at DESC)
    WHERE flagged_for_review_at IS NOT NULL;

COMMIT;
