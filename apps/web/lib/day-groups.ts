import type { FeedPost } from "./queries";

export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "UTC" });
}

export function dayLabel(iso: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-CA", { timeZone: "UTC" });
  const dk = dayKey(iso);
  if (dk === today) return "Today";
  if (dk === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday:  "short",
    day:      "2-digit",
    month:    "short",
    year:     "numeric",
    timeZone: "UTC",
  });
}

export interface DayGroup {
  key:   string;
  label: string;
  posts: FeedPost[];
}

export function groupByDay(posts: FeedPost[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const post of posts) {
    const k = dayKey(post.posted_at);
    if (!current || current.key !== k) {
      current = { key: k, label: dayLabel(post.posted_at), posts: [] };
      groups.push(current);
    }
    current.posts.push(post);
  }
  return groups;
}
