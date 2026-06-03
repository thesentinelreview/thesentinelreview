"use client";

import PostCard from "@/components/PostCard";
import { useTimeline } from "@/components/watchfloor/TimelineProvider";
import { groupByDay } from "@/lib/day-groups";
import type { FeedPost } from "@/lib/queries";

interface WatchEntry {
  confirmed: boolean;
  event_id:  string | null;
}

export default function FeedPostList({
  posts,
  watchInfo,
  isAuthed,
}: {
  posts:     FeedPost[];
  watchInfo: Record<string, WatchEntry | undefined>;
  isAuthed:  boolean;
}) {
  const { cursorMs } = useTimeline();

  // Hide posts newer than the playhead — mirrors the watchfloor map's
  // `occurred_at <= cursor` filter. With no provider the cursor is +Infinity
  // (TimelineProvider's NO_TIMELINE default) so every post passes through.
  const visible = posts.filter(
    (p) => new Date(p.posted_at).getTime() <= cursorMs,
  );
  const groups = visible.length > 0 ? groupByDay(visible) : [];

  if (visible.length === 0) {
    return (
      <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-sm text-[11px] font-data tracking-[0.08em] uppercase text-zinc-500">
        No posts before this playhead.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div className="flex justify-between items-baseline pb-2 mt-3 first:mt-0 border-b border-zinc-900">
            <span className="text-[12px] font-data tracking-[0.08em] uppercase text-zinc-200">
              {group.label}
            </span>
            <span className="text-[10px] font-data tracking-[0.08em] uppercase text-zinc-500">
              {group.posts.length} post{group.posts.length !== 1 ? "s" : ""}
            </span>
          </div>
          {group.posts.map((post) => {
            const info = watchInfo[post.id];
            return (
              <PostCard
                key={post.id}
                post={post}
                watchable
                isAuthed={isAuthed}
                initialWatched={!!info}
                confirmed={info?.confirmed ?? false}
                eventId={info?.event_id ?? null}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
