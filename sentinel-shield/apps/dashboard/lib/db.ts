import { Pool } from "pg";

declare global {
  // Prevent HMR from creating multiple pools in dev
  // eslint-disable-next-line no-var
  var __shieldPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__shieldPool) {
    globalThis.__shieldPool = new Pool({
      connectionString: process.env.SHIELD_DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__shieldPool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
