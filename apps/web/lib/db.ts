import { Pool, type QueryResultRow } from "pg";

// Store on globalThis so Next.js HMR module re-evaluations don't leak pools.
declare global {
  var __pgPool: Pool | undefined;
}

export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function getPool(): Pool {
  if (!globalThis.__pgPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }
    globalThis.__pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
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
