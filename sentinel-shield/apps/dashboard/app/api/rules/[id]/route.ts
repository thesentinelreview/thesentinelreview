import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rule = await queryOne(
      `SELECT id, rule_name, rule_content, threat_family as category, severity, source, enabled, created_at
       FROM yara_rules WHERE id = $1`,
      [id]
    );
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, category, severity, rule_content, enabled } = body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (name !== undefined) { fields.push(`rule_name = $${i++}`); values.push(name); }
    if (category !== undefined) { fields.push(`threat_family = $${i++}`); values.push(category); }
    if (severity !== undefined) { fields.push(`severity = $${i++}`); values.push(severity); }
    if (rule_content !== undefined) { fields.push(`rule_content = $${i++}`); values.push(rule_content); }
    if (enabled !== undefined) { fields.push(`enabled = $${i++}`); values.push(enabled); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `UPDATE yara_rules SET ${fields.join(", ")} WHERE id = $${i} RETURNING id`,
      values
    );

    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "Rule name already exists" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await query(
      `DELETE FROM yara_rules WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
