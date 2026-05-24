"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

/**
 * Promote a candidate to the production `sources` table.
 * Copies identity (handle, platform, display_name, url) and applies the
 * trust_tier + theaters chosen by the reviewer.
 *
 * Phase A: direct promotion. No shadow window — Jacob is making the call
 * based on the mention evidence shown in the queue.
 */
export async function approveCandidate(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }

  const candidateId = String(formData.get("candidate_id") ?? "");
  const trustTier   = Math.min(5, Math.max(0, Number(formData.get("trust_tier") ?? 2)));
  const theaters    = formData.getAll("theaters").map(String).filter(Boolean);
  const notes       = String(formData.get("notes") ?? "").trim() || null;
  const displayName = String(formData.get("display_name") ?? "").trim() || null;

  if (!candidateId) throw new Error("candidate_id required");
  if (theaters.length === 0) throw new Error("at least one theater required");

  const candidate = await queryOne<{
    id:       string;
    handle:   string;
    platform: string;
    url:      string | null;
  }>(
    `SELECT id, handle, platform, url
     FROM candidate_sources
     WHERE id = $1 AND status IN ('discovered','shadow_complete')`,
    [candidateId],
  );
  if (!candidate) throw new Error("candidate not found or already actioned");

  // Existing X sources use the '@handle' convention; Telegram/Bluesky/RSS
  // are stored bare. Mirror that when promoting so the ingest workflow
  // recognises the platform's identifier format.
  const handleForSource =
    candidate.platform === "x" && !candidate.handle.startsWith("@")
      ? `@${candidate.handle}`
      : candidate.handle;

  // Promote in a single transaction: insert source, mark candidate approved.
  // We don't use a Postgres transaction wrapper here because @/lib/db's
  // pooled query() doesn't expose one — but the two statements are
  // independently safe and the UPDATE only runs if the INSERT succeeds.
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO sources (handle, platform, display_name, url, theaters, trust_tier, is_active, notes)
     VALUES ($1, $2, $3, $4, $5::text[], $6, true, $7)
     ON CONFLICT (handle) DO NOTHING
     RETURNING id`,
    [
      handleForSource,
      candidate.platform,
      displayName ?? handleForSource,
      candidate.url,
      theaters,
      trustTier,
      notes,
    ],
  );
  if (!inserted) {
    // Handle collision — someone (or a parallel run) created this source
    // between candidate discovery and approval. Surface clearly.
    throw new Error(
      `source with handle "${handleForSource}" already exists; cannot promote`,
    );
  }

  await query(
    `UPDATE candidate_sources
     SET status              = 'approved',
         reviewed_at         = now(),
         promoted_source_id  = $1,
         reviewer_notes      = $2,
         updated_at          = now()
     WHERE id = $3`,
    [inserted.id, notes, candidateId],
  );

  revalidatePath("/admin/sources");
}

/**
 * Reject a candidate. Source row is NOT created.
 * Future re-discoveries of the same (platform, handle) will hit the UNIQUE
 * constraint and update last_seen_at on the existing rejected row, which is
 * fine — keeps history visible but doesn't re-enter the queue.
 */
export async function rejectCandidate(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }

  const candidateId = String(formData.get("candidate_id") ?? "");
  const reason      = String(formData.get("rejection_reason") ?? "").trim() || null;

  if (!candidateId) throw new Error("candidate_id required");

  await query(
    `UPDATE candidate_sources
     SET status            = 'rejected',
         reviewed_at       = now(),
         rejection_reason  = $1,
         updated_at        = now()
     WHERE id = $2
       AND status IN ('discovered','shadow_complete')`,
    [reason, candidateId],
  );

  revalidatePath("/admin/sources");
}

/**
 * Defer a candidate — clear from the review queue without committing.
 * Sets status='expired'. Future mentions will surface a fresh candidate
 * because the UNIQUE constraint matches by (platform, handle) and ON CONFLICT
 * updates last_seen_at + mention_count, so an expired one keeps accumulating
 * signal but is hidden from the active queue until you re-open it manually.
 */
export async function deferCandidate(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("unauthorized");
  }

  const candidateId = String(formData.get("candidate_id") ?? "");
  if (!candidateId) throw new Error("candidate_id required");

  await query(
    `UPDATE candidate_sources
     SET status     = 'expired',
         updated_at = now()
     WHERE id = $1
       AND status IN ('discovered','shadow_complete')`,
    [candidateId],
  );

  revalidatePath("/admin/sources");
}

/**
 * Server action wrapper that lets a form post and redirect to a new filter.
 * Used by the filter chips at the top of the page.
 */
export async function setFilter(formData: FormData): Promise<void> {
  const status = String(formData.get("status") ?? "discovered");
  redirect(`/admin/sources?status=${encodeURIComponent(status)}`);
}
