import { auth } from "@clerk/nextjs/server";
import { query, queryOne } from "@/lib/db";
import { getEntitlementsForUser } from "@/lib/entitlements";
import { generateApiKey } from "@/lib/api-v1-core";

// Clerk-session authenticated (proxy.ts baseline) key management for /account.
// Creation requires canUseApi (analyst+) — re-derived live, like the API itself.

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });

  const entitlements = await getEntitlementsForUser(userId);
  if (!entitlements.canUseApi) {
    return Response.json(
      { error: "API keys require an active Analyst subscription.", code: "tier_insufficient" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim().slice(0, 80) || "default";

  const { key, hash, prefix } = generateApiKey();
  const row = await queryOne<{ id: string; created_at: Date }>(
    `INSERT INTO api_keys (clerk_user_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, created_at`,
    [userId, hash, prefix, name],
  );

  // The ONLY time the full key is ever returned or displayed.
  return Response.json({ id: row?.id, name, key, key_prefix: prefix, created_at: row?.created_at });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return Response.json({ error: "id required", code: "invalid_parameter" }, { status: 422 });

  // Owner-scoped revoke; revocation takes effect on the key's next request.
  await query(
    `UPDATE api_keys SET revoked_at = now()
     WHERE id = $1::uuid AND clerk_user_id = $2 AND revoked_at IS NULL`,
    [body.id, userId],
  );
  return Response.json({ revoked: true });
}
