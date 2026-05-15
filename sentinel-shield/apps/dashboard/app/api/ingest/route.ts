import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import bcrypt from "bcryptjs";

async function validateSensor(apiKey: string): Promise<{ sensor_id: string; asset_id: string | null } | null> {
  const sensors = await query<{ id: string; api_key_hash: string; asset_id: string | null }>(
    "SELECT id, api_key_hash, asset_id FROM sensors WHERE is_active = true"
  );
  for (const sensor of sensors) {
    if (await bcrypt.compare(apiKey, sensor.api_key_hash)) {
      // Update last checkin
      await query("UPDATE sensors SET last_checkin = now() WHERE id = $1", [sensor.id]);
      return { sensor_id: sensor.id, asset_id: sensor.asset_id };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sensor = await validateSensor(apiKey);
  if (!sensor) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.events || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let inserted = 0;
  for (const ev of body.events) {
    try {
      await query(
        `INSERT INTO telemetry_events (
          sensor_id, asset_id, event_time, event_type,
          process_name, process_pid, process_hash, process_cmdline, parent_process,
          src_ip, dst_ip, dst_port, protocol, dns_query, http_url, bytes_sent,
          file_path, file_hash, user_account, auth_success, raw_payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::inet,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          sensor.sensor_id,
          sensor.asset_id,
          ev.event_time ?? new Date().toISOString(),
          ev.event_type,
          ev.process_name ?? null,
          ev.process_pid ?? null,
          ev.process_hash ?? null,
          ev.process_cmdline ?? null,
          ev.parent_process ?? null,
          ev.src_ip ?? null,
          ev.dst_ip ?? null,
          ev.dst_port ?? null,
          ev.protocol ?? null,
          ev.dns_query ?? null,
          ev.http_url ?? null,
          ev.bytes_sent ?? null,
          ev.file_path ?? null,
          ev.file_hash ?? null,
          ev.user_account ?? null,
          ev.auth_success ?? null,
          JSON.stringify(ev.raw_payload ?? {}),
        ]
      );
      inserted++;
    } catch (err) {
      // Log but continue — partial batches are acceptable
      console.error("event insert error", err);
    }
  }

  return NextResponse.json({ ok: true, inserted });
}
