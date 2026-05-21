import { auth } from "@clerk/nextjs/server";
import { query } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readRawPostId(req: Request): Promise<string | null> {
  try {
    const body = await req.json();
    const id = typeof body?.raw_post_id === "string" ? body.raw_post_id : null;
    return id && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const rawPostId = await readRawPostId(req);
  if (!rawPostId) return new Response("Invalid raw_post_id", { status: 400 });

  await query(
    `INSERT INTO watches (clerk_user_id, raw_post_id)
     VALUES ($1, $2)
     ON CONFLICT (clerk_user_id, raw_post_id) DO NOTHING`,
    [userId, rawPostId],
  );
  return Response.json({ watched: true });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const rawPostId = await readRawPostId(req);
  if (!rawPostId) return new Response("Invalid raw_post_id", { status: 400 });

  await query(
    `DELETE FROM watches WHERE clerk_user_id = $1 AND raw_post_id = $2`,
    [userId, rawPostId],
  );
  return Response.json({ watched: false });
}
