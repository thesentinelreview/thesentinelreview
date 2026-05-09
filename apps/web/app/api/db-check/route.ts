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
    const result = await pool.query("SELECT COUNT(*) AS n FROM sources");
    await pool.end();
    return NextResponse.json({ ok: true, sources: result.rows[0].n, url_prefix: url.slice(0, 40) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), url_prefix: url.slice(0, 40) });
  }
}
