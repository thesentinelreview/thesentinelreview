import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

type CheckResult = {
  name: string;
  passed: boolean;
  severity: "critical" | "warning";
  detail: string;
  value: number;
};

async function runChecks(pool: Pool): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // --- Critical checks ---

  const stuckJobs = await pool.query(
    `SELECT COUNT(*)::int AS n FROM jobs
     WHERE status = 'running' AND started_at < now() - interval '30 minutes'`
  );
  const stuck = stuckJobs.rows[0].n;
  results.push({
    name: "stuck_running_jobs",
    passed: stuck === 0,
    severity: "critical",
    detail: stuck ? `${stuck} job(s) stuck in 'running' for >30 min` : "0 stuck jobs",
    value: stuck,
  });

  const failedJobs = await pool.query(
    `SELECT COUNT(*)::int AS n, STRING_AGG(DISTINCT job_type, ', ') AS types
     FROM jobs WHERE status = 'failed' AND created_at > now() - interval '24 hours'`
  );
  const failed = failedJobs.rows[0].n;
  const failedTypes = failedJobs.rows[0].types;
  results.push({
    name: "failed_jobs_24h",
    passed: failed === 0,
    severity: "critical",
    detail: failed
      ? `${failed} job(s) permanently failed in last 24h (types: ${failedTypes})`
      : "0 failed jobs in last 24h",
    value: failed,
  });

  const lastPublished = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (now() - MAX(published_at))) / 60 AS age_minutes
     FROM events WHERE published_at IS NOT NULL`
  );
  const ageMin = lastPublished.rows[0].age_minutes != null
    ? Math.round(Number(lastPublished.rows[0].age_minutes))
    : 99999;
  const threshold48h = 48 * 60;
  results.push({
    name: "no_published_events_48h",
    passed: ageMin < threshold48h,
    severity: "critical",
    detail: ageMin >= 99999
      ? "no published events found at all"
      : ageMin < threshold48h
        ? `last published event ${ageMin} min ago`
        : `last published event ${ageMin} min ago — exceeds 48h threshold`,
    value: ageMin,
  });

  const orphaned = await pool.query(
    `SELECT COUNT(*)::int AS n FROM events
     WHERE published_at IS NULL AND held_for_review = false`
  );
  const orphanedCount = orphaned.rows[0].n;
  results.push({
    name: "orphaned_published",
    passed: orphanedCount === 0,
    severity: "critical",
    detail: orphanedCount
      ? `${orphanedCount} event(s) are not held but have NULL published_at`
      : "all non-held events have published_at",
    value: orphanedCount,
  });

  const futureTs = await pool.query(
    `SELECT COUNT(*)::int AS n FROM events WHERE occurred_at > now() + interval '1 hour'`
  );
  const futureCount = futureTs.rows[0].n;
  results.push({
    name: "future_occurred_at",
    passed: futureCount === 0,
    severity: "critical",
    detail: futureCount
      ? `${futureCount} event(s) have occurred_at in the future`
      : "no events with future timestamps",
    value: futureCount,
  });

  // --- Warning checks ---

  const unprocessed = await pool.query(
    `SELECT COUNT(*)::int AS n FROM raw_posts
     WHERE processed_at IS NULL AND skip_reason IS NULL
       AND ingested_at < now() - interval '2 hours'`
  );
  const unprocessedCount = unprocessed.rows[0].n;
  results.push({
    name: "unprocessed_posts_old",
    passed: unprocessedCount === 0,
    severity: "warning",
    detail: unprocessedCount
      ? `${unprocessedCount} post(s) unprocessed for >2h`
      : "no stale unprocessed posts",
    value: unprocessedCount,
  });

  const skipRate = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE processed_at IS NOT NULL)::int AS processed,
       COUNT(*) FILTER (WHERE skip_reason IS NOT NULL)::int  AS skipped
     FROM raw_posts WHERE ingested_at > now() - interval '24 hours'`
  );
  const { processed, skipped } = skipRate.rows[0];
  const skipPct = processed > 0 ? Math.round((skipped / processed) * 100) : 0;
  results.push({
    name: "high_skip_rate_24h",
    passed: processed === 0 || skipPct <= 75,
    severity: "warning",
    detail: processed === 0
      ? "no posts processed in last 24h (nothing to measure)"
      : `${skipPct}% skip rate (${skipped}/${processed} posts in last 24h)`,
    value: skipPct,
  });

  const threshold8h = 8 * 60;
  results.push({
    name: "no_published_events_8h",
    passed: ageMin < threshold8h,
    severity: "warning",
    detail: ageMin >= 99999
      ? "no published events found at all"
      : ageMin < threshold8h
        ? `last published event ${ageMin} min ago`
        : `last published event ${ageMin} min ago — exceeds 8h threshold`,
    value: ageMin,
  });

  const heldBacklog = await pool.query(
    `SELECT COUNT(*)::int AS n FROM events WHERE held_for_review = true`
  );
  const heldCount = heldBacklog.rows[0].n;
  results.push({
    name: "held_events",
    passed: heldCount === 0,
    severity: "warning",
    detail: heldCount
      ? `${heldCount} event(s) still held for review (should be 0 — run migration 0007)`
      : "no events held for review",
    value: heldCount,
  });

  const silentSources = await pool.query(
    `SELECT COUNT(*)::int AS n FROM sources s
     WHERE s.is_active = true AND NOT EXISTS (
       SELECT 1 FROM raw_posts rp
       WHERE rp.source_id = s.id
         AND rp.ingested_at > now() - interval '72 hours'
     )`
  );
  const silentCount = silentSources.rows[0].n;
  results.push({
    name: "silent_active_sources",
    passed: silentCount <= 5,
    severity: "warning",
    detail: silentCount
      ? `${silentCount} active source(s) produced no posts in last 72h`
      : "all active sources have recent posts",
    value: silentCount,
  });

  return results;
}

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" }, { status: 500 });
  }

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });

  try {
    const checks = await runChecks(pool);
    await pool.end();

    const criticalFailures = checks.filter((c) => !c.passed && c.severity === "critical").length;
    const warnings = checks.filter((c) => !c.passed && c.severity === "warning").length;

    return NextResponse.json({
      ok: criticalFailures === 0,
      checks,
      critical_failures: criticalFailures,
      warnings,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    await pool.end().catch(() => {});
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
