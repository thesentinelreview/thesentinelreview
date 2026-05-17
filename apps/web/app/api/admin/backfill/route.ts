import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

// One-shot endpoint to backfill published_at and fix stale occurred_at values.
export async function GET() {
  return handler();
}

export async function POST(_req: NextRequest) {
  return handler();
}

async function handler() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" });
  }

  try {
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });

    // Fix 1: set published_at for non-held events that are missing it
    const r1 = await pool.query(`
      UPDATE events
      SET published_at = created_at
      WHERE held_for_review = false
        AND published_at IS NULL
    `);

    // Fix 2: fix occurred_at for events created recently but with stale occurred_at
    // (LLM guessed an old date when post_timestamp wasn't provided)
    const r2 = await pool.query(`
      UPDATE events
      SET occurred_at = created_at
      WHERE created_at > now() - INTERVAL '30 days'
        AND occurred_at < created_at - INTERVAL '30 days'
    `);

    await pool.end();
    return NextResponse.json({
      ok: true,
      published_at_fixed: r1.rowCount,
      occurred_at_fixed: r2.rowCount,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
