import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "100");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  try {
    const rules = await query(
      `SELECT id, rule_name, threat_family as category, severity, source, enabled, created_at,
              length(rule_content) as content_length
       FROM yara_rules
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM yara_rules`);
    return NextResponse.json({ rules, total: parseInt(total?.count ?? "0") });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, severity, rule_content, enabled = true } = body;

    if (!name || !rule_content) {
      return NextResponse.json({ error: "name and rule_content are required" }, { status: 400 });
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO yara_rules (rule_name, rule_content, threat_family, severity, source, enabled)
       VALUES ($1, $2, $3, $4, 'custom', $5)
       RETURNING id`,
      [name, rule_content, category ?? null, severity ?? null, enabled]
    );

    return NextResponse.json({ id: row?.id }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "Rule name already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
