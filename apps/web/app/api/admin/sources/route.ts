import { isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

// Admin-only: flip a source's active flag. The single write in admin v1's
// sources module — everything else there is read-only.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  if (!id) return Response.json({ error: "Missing source id" }, { status: 400 });

  await query(`UPDATE sources SET is_active = NOT is_active WHERE id = $1::uuid`, [id]);

  return Response.redirect(new URL("/admin/sources", req.url), 303);
}
