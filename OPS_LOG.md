# Sentinel Ops Log

## 2026-05-29 — Rogue Neon project deleted (data confirmed preserved)

Deleted Neon project `tiny-night-97017367` ("Sentinel Dashboard", endpoint
`ep-empty-leaf-ap4p0pzo`, us-east-1) — the disposable copy from the 2026-05-24→26
rogue-write incident.

Pre-deletion read-only tie-out (Supabase prod `ugpqgfvdqupttqhogavc`, matched on
`raw_posts.external_id`) confirmed the backup was complete before deleting:
- 342/342 rogue-window raw_posts present (window: posted 2026-05-24 13:32 →
  05-25 23:26 UTC, ingested → 05-26 00:03). Rows absent by both id and content: 0.
- 342/342 processed, 0 pending (279 carry a skip_reason — expected off-topic wire copy).
- The "209 missing by id" in the first pass was a benign #164 backfill id-remap
  (those rows already existed under Supabase-native ids), not data loss.

Conclusion: the Neon copy was fully redundant; nothing lost on deletion. The
"is the rogue Neon safe to delete" question is closed. Neon is no longer part of
this system.
