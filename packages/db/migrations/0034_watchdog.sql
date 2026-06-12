-- =============================================================================
-- 0034_watchdog.sql
--
-- Pipeline staleness watchdog: explicit workflow heartbeats + an in-DB pg_cron
-- sentinel that files a GitHub issue (via pg_net) when a heartbeat goes stale.
--
-- Why in-DB: three GitHub-cron silences in 36 h (2026-06-10..12 — backup one
-- night, ingest twice, including a 4-tick gap). Each was detected by a human
-- noticing, hours late. The failing component is GitHub's scheduler, so
-- detection must not live on it; Supabase is the one component that has never
-- gone dark. The notification channel (pg_net HTTP POST straight to the GitHub
-- Issues API) likewise does not depend on GitHub's scheduler.
--
-- Why explicit heartbeats, not max(raw_posts.posted_at): inferring pipeline
-- health from data recency conflates news volume with pipeline function — a
-- quiet news hour false-alarms, a backfilled post false-greens. Each workflow
-- writes its own beat after a green run (sentinel-ingest.yml, after integrity
-- checks; sentinel-db-backup.yml, after the verified upload), so a beat means
-- "the whole run worked", and a missing beat means "the run didn't happen or
-- didn't finish" — failed runs already page through notify-failure issues.
--
-- Semantics (thresholds are documented again inside watchdog_check):
--   * ingest beat older than 75 min  -> alert.
--   * backup beat older than 26 h    -> alert.
--   * Dedupe: while an unresolved alert of the same kind from the last 6 h
--     exists, no new alert fires. A sustained outage therefore re-pages at
--     most every 6 h; a flapping pipeline produces at most one OPEN issue per
--     kind because recovery auto-resolves (and best-effort auto-closes) the
--     previous issue before a new one can accrue 75 min of staleness.
--   * Recovery: a fresh beat auto-resolves open alerts and best-effort posts
--     a recovery comment + closes the issue (GraphQL closeIssue — pg_net has
--     no PATCH, and GraphQL rides a plain POST).
--   * The watchdog must never break the database it guards: every Vault read
--     and HTTP call is exception-wrapped; failures land in
--     watchdog_alerts.details as ledger evidence instead of throwing.
--
-- Operator setup (one-time, NOT in this file; see PR for the full runbook):
--   Supabase Dashboard -> Vault -> add secret named github_watchdog_pat —
--   a fine-grained PAT scoped to this repo only, permission Issues:read/write
--   and nothing else. The value never transits the repo, chat, or workflows.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS; seeds ON CONFLICT DO NOTHING;
-- CREATE OR REPLACE FUNCTION; CREATE POLICY guarded by pg_policies checks;
-- extension creation guarded by pg_available_extensions + exception handler;
-- cron.schedule() upserts by job name (and is preceded by a defensive
-- unschedule). The pg_extension guard makes scheduling a no-op where pg_cron
-- is unavailable (local harness), matching 0014/0028.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions. pg_cron is already enabled in prod (0014/0028 jobs run on it);
-- pg_net is available on Supabase but not yet enabled. If the migration role
-- cannot create them, the guard degrades to a WARNING naming the one-time
-- dashboard toggle — the migration itself must not fail, and watchdog_check()
-- records the missing dependency in its ledger at runtime either way.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_cron;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '0034: could not enable pg_cron (%). One-time manual step: Supabase Dashboard -> Database -> Extensions -> pg_cron, then re-run the scheduling block at the bottom of 0034_watchdog.sql.', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '0034: pg_cron unavailable on this server (expected on the local harness); watchdog will not be scheduled here.';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_net;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '0034: could not enable pg_net (%). One-time manual step: Supabase Dashboard -> Database -> Extensions -> pg_net. Until then watchdog_check() records notify_error in watchdog_alerts.details instead of filing issues.', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '0034: pg_net unavailable on this server (expected on the local harness); alerts will be ledger-only here.';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Heartbeats: one row per monitored workflow kind ('ingest', 'backup').
-- beat_at = the last instant the workflow proved itself alive. Seeded at
-- migration time with now() — the real "watchdog epoch start" — so the first
-- alert can only fire if a pipeline goes silent AFTER the watchdog exists
-- (no rollout false alarm while the workflow edits in this PR deploy).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_heartbeats (
    kind    TEXT        PRIMARY KEY,
    beat_at TIMESTAMPTZ NOT NULL
);

-- ON CONFLICT DO NOTHING, NOT DO UPDATE: a re-run must never move a live beat.
INSERT INTO pipeline_heartbeats (kind, beat_at)
VALUES ('ingest', now()), ('backup', now())
ON CONFLICT (kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Alert ledger. One row per fire; resolved_at set by the auto-resolve path.
-- details carries the full lifecycle as evidence: last_beat_at/threshold at
-- fire time, pg_net request ids, harvested GitHub issue number/node/url and
-- HTTP status, recovery info, and any vault/net error encountered.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchdog_alerts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        TEXT        NOT NULL,
    fired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    details     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMPTZ
);

-- Serves both the dedupe lookup and the resolve scan (open alerts per kind).
CREATE INDEX IF NOT EXISTS watchdog_alerts_open_idx
    ON watchdog_alerts (kind, fired_at DESC)
    WHERE resolved_at IS NULL;

-- RLS posture per 0031/0032: enabled + explicit deny-all. The pipeline,
-- the cron job, and the dashboard all connect as the table owner (postgres)
-- and bypass RLS; nothing else has any business here.
ALTER TABLE pipeline_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchdog_alerts     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pipeline_heartbeats' AND policyname='deny_all') THEN
        CREATE POLICY deny_all ON pipeline_heartbeats FOR ALL USING (false) WITH CHECK (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='watchdog_alerts' AND policyname='deny_all') THEN
        CREATE POLICY deny_all ON watchdog_alerts FOR ALL USING (false) WITH CHECK (false);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- watchdog_github_post: authenticated POST to the GitHub API via pg_net.
-- Returns the async pg_net request id; the response is only readable on a
-- LATER tick (net._http_response), which is what watchdog_harvest_http does.
-- Raises on a missing secret or absent pg_net — callers wrap and ledger it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION watchdog_github_post(p_url text, p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_pat text;
BEGIN
    -- trim(): Vault values are pasted by hand into the dashboard, and pasted
    -- secrets are a whitespace hazard (the same failure class cleanEnv in
    -- apps/web and the R2 trim in sentinel-db-backup.yml exist for). A stray
    -- trailing newline here would corrupt the Authorization header.
    SELECT trim(decrypted_secret) INTO v_pat
    FROM vault.decrypted_secrets
    WHERE name = 'github_watchdog_pat';

    IF v_pat IS NULL OR v_pat = '' THEN
        RAISE EXCEPTION 'vault secret github_watchdog_pat is missing or empty';
    END IF;

    RETURN net.http_post(
        url                  => p_url,
        body                 => p_payload,
        headers              => jsonb_build_object(
            'Authorization',        'Bearer ' || v_pat,
            'Accept',               'application/vnd.github+json',
            'X-GitHub-Api-Version', '2022-11-28',
            'User-Agent',           'sentinel-watchdog',
            'Content-Type',         'application/json'
        ),
        timeout_milliseconds => 10000
    );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- watchdog_harvest_http: copy the GitHub API outcome of earlier fires into the
-- ledger. pg_net is async, so the issue number/node id only exist in
-- net._http_response on the tick AFTER the fire (well inside pg_net's 6 h
-- response TTL at a 15-min cadence). Runs on every check, both branches, so a
-- recovery that arrives before the next stale tick still learns its issue
-- number in time to comment/close.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION watchdog_harvest_http(p_kind text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    a RECORD;
    r RECORD;
BEGIN
    FOR a IN
        SELECT id, (details->>'issue_request_id')::bigint AS req_id
        FROM watchdog_alerts
        WHERE kind = p_kind
          AND resolved_at IS NULL
          AND details ? 'issue_request_id'
          AND NOT details ? 'issue_number'       -- already harvested OK
          AND NOT details ? 'issue_http_status'  -- already harvested non-201
          AND NOT details ? 'harvest_error'      -- harvest itself failed; don't spin
    LOOP
        BEGIN
            SELECT status_code, content, error_msg INTO r
            FROM net._http_response
            WHERE id = a.req_id;

            IF NOT FOUND THEN
                CONTINUE;  -- response not in yet; try again next tick
            END IF;

            IF r.status_code = 201 THEN
                UPDATE watchdog_alerts
                SET details = details || jsonb_build_object(
                    'issue_http_status', r.status_code,
                    'issue_number',      (r.content::jsonb)->'number',
                    'issue_node_id',     (r.content::jsonb)->>'node_id',
                    'issue_url',         (r.content::jsonb)->>'html_url')
                WHERE id = a.id;
            ELSE
                UPDATE watchdog_alerts
                SET details = details || jsonb_build_object(
                    'issue_http_status', r.status_code,
                    'issue_error',       coalesce(r.error_msg, left(r.content, 500)))
                WHERE id = a.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- e.g. pg_net not installed (net schema absent). Recorded once.
            UPDATE watchdog_alerts
            SET details = details || jsonb_build_object('harvest_error', SQLERRM)
            WHERE id = a.id;
        END;
    END LOOP;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- watchdog_check: the 15-min sentinel. Returns the number of alerts fired
-- this call (0 on a healthy tick) so manual runs and the harness can assert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION watchdog_check()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    gh_repo  CONSTANT text     := 'thesentinelreview/thesentinelreview';
    api_base CONSTANT text     := 'https://api.github.com';
    -- Sustained-outage re-page interval: while a kind STAYS silent, a fresh
    -- issue is filed at most every 6 h (the dedupe below only suppresses
    -- while an unresolved alert younger than this exists).
    repage   CONSTANT interval := interval '6 hours';
    spec        RECORD;
    a           RECORD;
    v_last_beat timestamptz;
    v_stale     boolean;
    v_alert_id  bigint;
    v_req       bigint;
    v_since     text;
    v_title     text;
    v_body      text;
    v_fired     integer := 0;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            -- ingest: sentinel-ingest.yml runs '*/30 * * * *'. Threshold
            -- 75 min = two consecutive missed 30-min ticks plus a 15-min
            -- drift buffer — GitHub schedules are best-effort and routinely
            -- start minutes late, so one late tick must not page.
            ('ingest', interval '75 minutes',
             '75 minutes (two missed 30-min ticks + drift buffer)',
             'Sentinel — Ingest Sources'),
            -- backup: sentinel-db-backup.yml runs daily at 02:47 UTC.
            -- Threshold 26 h = one fully missed night plus a 2-h drift buffer.
            ('backup', interval '26 hours',
             '26 hours (one missed nightly run + 2 h drift buffer)',
             'Sentinel — DB Backup to R2')
        ) AS t(kind, max_silence, threshold_desc, workflow_name)
    LOOP
        SELECT beat_at INTO v_last_beat
        FROM pipeline_heartbeats
        WHERE kind = spec.kind;

        -- A missing row is treated as stale: the seed in this migration puts
        -- both rows in place, so absence means someone deleted state.
        v_stale := v_last_beat IS NULL OR v_last_beat < now() - spec.max_silence;

        PERFORM watchdog_harvest_http(spec.kind);

        IF NOT v_stale THEN
            -- Fresh beat: auto-resolve every open alert for this kind and
            -- best-effort comment on + close the GitHub issue each one filed.
            FOR a IN
                SELECT id, details FROM watchdog_alerts
                WHERE kind = spec.kind AND resolved_at IS NULL
            LOOP
                UPDATE watchdog_alerts
                SET resolved_at = now(),
                    details = details || jsonb_build_object('resolved_beat_at', v_last_beat)
                WHERE id = a.id;

                IF a.details ? 'issue_number' THEN
                    BEGIN
                        v_req := watchdog_github_post(
                            api_base || '/repos/' || gh_repo || '/issues/'
                                     || (a.details->>'issue_number') || '/comments',
                            jsonb_build_object('body',
                                '`' || spec.kind || '` heartbeat recovered at '
                                || to_char(v_last_beat AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
                                || ' UTC — auto-resolving. (sentinel-watchdog)'));
                        UPDATE watchdog_alerts
                        SET details = details || jsonb_build_object('resolve_comment_request_id', v_req)
                        WHERE id = a.id;
                    EXCEPTION WHEN OTHERS THEN
                        UPDATE watchdog_alerts
                        SET details = details || jsonb_build_object('resolve_comment_error', SQLERRM)
                        WHERE id = a.id;
                    END;
                END IF;

                IF a.details ? 'issue_node_id' THEN
                    BEGIN
                        -- GraphQL because closing an issue is PATCH in REST
                        -- and pg_net only speaks GET/POST/DELETE.
                        v_req := watchdog_github_post(
                            api_base || '/graphql',
                            jsonb_build_object(
                                'query',     'mutation($id: ID!) { closeIssue(input: {issueId: $id}) { issue { number } } }',
                                'variables', jsonb_build_object('id', a.details->>'issue_node_id')));
                        UPDATE watchdog_alerts
                        SET details = details || jsonb_build_object('close_request_id', v_req)
                        WHERE id = a.id;
                    EXCEPTION WHEN OTHERS THEN
                        UPDATE watchdog_alerts
                        SET details = details || jsonb_build_object('close_error', SQLERRM)
                        WHERE id = a.id;
                    END;
                END IF;
            END LOOP;

        ELSE
            -- Dedupe: at most one fire per kind per repage window while
            -- unresolved. (Resolved alerts don't suppress — after a recovery,
            -- a NEW silence must again accrue max_silence before firing.)
            IF EXISTS (
                SELECT 1 FROM watchdog_alerts
                WHERE kind = spec.kind
                  AND resolved_at IS NULL
                  AND fired_at > now() - repage
            ) THEN
                CONTINUE;
            END IF;

            v_since := coalesce(
                to_char(v_last_beat AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
                'forever (heartbeat row missing)');

            INSERT INTO watchdog_alerts (kind, details)
            VALUES (spec.kind, jsonb_build_object(
                'last_beat_at', v_last_beat,
                'threshold',    spec.threshold_desc,
                'workflow',     spec.workflow_name))
            RETURNING id INTO v_alert_id;
            v_fired := v_fired + 1;

            v_title := '[watchdog] ' || spec.kind || ' silent since ' || v_since;
            v_body  :=
                   '**Last `' || spec.kind || '` heartbeat:** ' || v_since || E'\n'
                || '**Threshold:** ' || spec.threshold_desc || E'\n'
                || '**Detected:** ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
                || ' UTC by the in-DB watchdog (pg_cron job `sentinel-watchdog`, migration 0034).'
                || E'\n\n'
                || '**Runbook:** GitHub → Actions → “' || spec.workflow_name
                || '” → Run workflow. If the run itself fails, a separate `pipeline failure:` issue with logs will follow.'
                || E'\n\n'
                || '_Auto-closes on the first watchdog tick after the heartbeat resumes._';

            BEGIN
                v_req := watchdog_github_post(
                    api_base || '/repos/' || gh_repo || '/issues',
                    jsonb_build_object('title', v_title, 'body', v_body));
                UPDATE watchdog_alerts
                SET details = details || jsonb_build_object('issue_request_id', v_req)
                WHERE id = v_alert_id;
            EXCEPTION WHEN OTHERS THEN
                -- The watchdog must never break the database it guards: a
                -- Vault/pg_net failure becomes ledger evidence, not a throw.
                UPDATE watchdog_alerts
                SET details = details || jsonb_build_object('notify_error', SQLERRM)
                WHERE id = v_alert_id;
            END;
        END IF;
    END LOOP;

    RETURN v_fired;
END;
$fn$;

COMMENT ON FUNCTION watchdog_check() IS
    'Pipeline staleness sentinel (migration 0034), run by pg_cron job '
    'sentinel-watchdog every 15 min. Fires a watchdog_alerts row + GitHub '
    'issue when a pipeline_heartbeats beat exceeds its threshold (ingest 75m, '
    'backup 26h); dedupes to one unresolved alert per kind per 6h; '
    'auto-resolves and best-effort closes the issue when beats resume. '
    'Returns the number of alerts fired this call.';

COMMENT ON TABLE pipeline_heartbeats IS
    'Liveness beats written by GitHub workflows after green runs '
    '(sentinel-ingest.yml, sentinel-db-backup.yml). Read by watchdog_check(). '
    'Deliberately NOT derived from data recency (volume != function).';

COMMENT ON TABLE watchdog_alerts IS
    'Watchdog fire/resolve ledger + dedupe state. details carries the alert '
    'lifecycle: fire context, pg_net request ids, harvested GitHub issue '
    'number/url/status, recovery stamps, and any vault/net errors.';

-- The github_post helper reads Vault; none of these are for general callers.
-- (The cron job runs as the scheduling role — the table/function owner — and
-- is unaffected.)
REVOKE ALL ON FUNCTION watchdog_check()                    FROM PUBLIC;
REVOKE ALL ON FUNCTION watchdog_harvest_http(text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION watchdog_github_post(text, jsonb)   FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Schedule. */15 keeps worst-case detection latency ~15 min past threshold.
-- cron.schedule() upserts by job name (0014/0028 precedent); the unschedule
-- is defensive so a re-run also survives a changed schedule string cleanly.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sentinel-watchdog';
        PERFORM cron.schedule('sentinel-watchdog', '*/15 * * * *', 'SELECT watchdog_check()');
    ELSE
        RAISE NOTICE '0034: pg_cron not installed; sentinel-watchdog NOT scheduled. On Supabase enable pg_cron (Dashboard -> Database -> Extensions), then run this DO block manually.';
    END IF;
END
$$;
