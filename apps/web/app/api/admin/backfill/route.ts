import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

// One-shot endpoint to backfill published_at. Removed after use.
export async function POST(_req: NextRequest) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" });
  }

  try {
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
    const result = await pool.query(`
      UPDATE events
      SET published_at = created_at
      WHERE held_for_review = false
        AND published_at IS NULL
    `);
    await pool.end();
    return NextResponse.json({ ok: true, rows_updated: result.rowCount });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
