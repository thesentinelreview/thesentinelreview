import { querySources } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await querySources();
  return Response.json(sources);
}
