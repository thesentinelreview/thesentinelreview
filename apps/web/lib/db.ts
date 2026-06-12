import { Pool, type QueryResultRow } from "pg";
import { cleanEnv } from "./env";

// Store on globalThis so Next.js HMR module re-evaluations AND warm lambda
// re-invocations share one Pool — never one pool per import or per request.
declare global {
  var __pgPool: Pool | undefined;
}

export function isDatabaseConfigured(): boolean {
  return !!cleanEnv(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!globalThis.__pgPool) {
    const connectionString = cleanEnv(process.env.DATABASE_URL);
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    // Serverless sizing (EMAXCONNSESSION incident, 2026-06-12): each warm
    // lambda holds its own pool, so per-lambda max must stay small — the
    // transaction pooler (:6543) multiplexes server-side. max 3 covers the
    // watchfloor's parallel query fan-out without serializing badly; short
    // idle + allowExitOnIdle release connections quickly between invocations.
    // Compatibility audit for Supavisor transaction mode: every call path
    // uses pool.query(text, values) — unnamed prepared statements, no SET /
    // LISTEN / advisory locks / multi-statement transactions.
    globalThis.__pgPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const result = await getPool().query(sql, params as unknown[]);
  return result.rowCount ?? 0;
}
