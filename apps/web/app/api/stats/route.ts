import { queryStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await queryStats();
  return Response.json(stats);
}
