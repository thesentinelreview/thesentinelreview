import { queryLatestBriefing } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const briefing = await queryLatestBriefing();
  if (!briefing) {
    return new Response(null, { status: 204 });
  }
  return Response.json(briefing);
}
