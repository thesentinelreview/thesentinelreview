import type { NextRequest } from "next/server";
import { queryEvents } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;

  const events = await queryEvents({
    minLng: p.has("minLng") ? Number(p.get("minLng")) : undefined,
    minLat: p.has("minLat") ? Number(p.get("minLat")) : undefined,
    maxLng: p.has("maxLng") ? Number(p.get("maxLng")) : undefined,
    maxLat: p.has("maxLat") ? Number(p.get("maxLat")) : undefined,
    hours:  p.has("hours")  ? Number(p.get("hours"))  : undefined,
  });

  return Response.json(events);
}
