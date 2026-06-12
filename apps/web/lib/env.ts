// Env-value hygiene shared by db/stripe reads — no imports, no I/O.

/**
 * Trim env-pasted whitespace. A secret/URL pasted into the Vercel UI with a
 * trailing newline corrupts auth headers, HMAC signatures, connection strings,
 * and ID equality checks (defect class from the R2 backup incident, PR #230).
 */
export function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Postgres undefined_table — the only error /admin/grants treats as benign. */
export function isUndefinedTableError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42P01";
}
