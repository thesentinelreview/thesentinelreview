import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL not set" });
  }

  try {
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    const [sources, events] = await Promise.all([
      pool.query("SELECT COUNT(*) AS n FROM sources"),
      pool.query(`
        SELECT
          COUNT(*)::int                                              AS total,
          COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int     AS published,
          COUNT(*) FILTER (WHERE occurred_at > now() - INTERVAL '24 hours'
                              AND published_at IS NOT NULL)::int    AS last_24h,
          COUNT(*) FILTER (WHERE occurred_at > now() - INTERVAL '7 days'
                              AND published_at IS NOT NULL)::int    AS last_7d,
          MAX(created_at)                                           AS last_inserted_at
        FROM events
      `),
    ]);
    await pool.end();
    return NextResponse.json({
      ok: true,
      sources: sources.rows[0].n,
      events: events.rows[0],
      url_prefix: url.slice(0, 40),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), url_prefix: url.slice(0, 40) });
  }
}
