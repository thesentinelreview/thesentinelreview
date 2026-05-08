import { queryIntensity } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const intensity = await queryIntensity();
  return Response.json(intensity);
}
