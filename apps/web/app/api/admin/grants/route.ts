import { auth } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

const GRANTABLE_TIERS = new Set(["analyst", "bureau", "admin"]);

// Admin-only writes for tier grants. proxy.ts guarantees a signed-in session
// on /api/*; the admin allowlist check is enforced here (access, not tier).
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { userId } = await auth();
  const form = await req.formData();
  const action = String(form.get("action") ?? "");

  if (action === "create") {
    const clerkUserId = String(form.get("clerk_user_id") ?? "").trim();
    const tier = String(form.get("tier") ?? "").trim();
    const note = String(form.get("note") ?? "").trim() || null;
    if (!clerkUserId.startsWith("user_") || !GRANTABLE_TIERS.has(tier)) {
      return Response.json({ error: "Invalid grant: need a Clerk user id and a grantable tier" }, { status: 400 });
    }
    // One grant row per user (UNIQUE): re-granting updates tier/note and
    // clears any prior revocation.
    await query(
      `INSERT INTO tier_grants (clerk_user_id, tier, note, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET tier = EXCLUDED.tier,
             note = EXCLUDED.note,
             granted_by = EXCLUDED.granted_by,
             created_at = now(),
             revoked_at = NULL`,
      [clerkUserId, tier, note, userId],
    );
  } else if (action === "revoke") {
    const id = String(form.get("id") ?? "");
    if (!id) return Response.json({ error: "Missing grant id" }, { status: 400 });
    await query(`UPDATE tier_grants SET revoked_at = now() WHERE id = $1::uuid`, [id]);
  } else {
    return Response.json({ error: "Unknown action" }, { status: 400 });
  }

  return Response.redirect(new URL("/admin/grants", req.url), 303);
}
