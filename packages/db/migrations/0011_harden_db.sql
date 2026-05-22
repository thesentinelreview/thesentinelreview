-- =============================================================================
-- 0011_harden_db.sql
-- Defense-in-depth hardening flagged by the Supabase linter:
--  * Pin search_path on functions to prevent search_path hijacking.
--    confidence_score references no objects (empty path is safe); events_in_bbox
--    needs public (tables) + extensions (PostGIS ST_* and the && operator).
--  * Remove Supabase Data API access (anon/authenticated) from the
--    source_reliability materialized view. The app connects as the owner role
--    and retains access; service_role is unaffected. These roles are
--    Supabase-managed and absent on plain Postgres, so the REVOKE is guarded.
-- =============================================================================

BEGIN;

ALTER FUNCTION confidence_score(text) SET search_path = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'events_in_bbox'
  ) THEN
    ALTER FUNCTION events_in_bbox(
      double precision, double precision, double precision, double precision,
      timestamp with time zone, timestamp with time zone
    ) SET search_path = public, extensions;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON source_reliability FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON source_reliability FROM authenticated';
  END IF;
END $$;

COMMIT;
