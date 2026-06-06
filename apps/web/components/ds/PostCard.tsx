"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, Eye, EyeOff, Star } from "lucide-react";
import type { FeedPost } from "@/lib/queries";
import { stripHtml } from "@/lib/text";
import { cn } from "@/lib/cn";
import Panel from "./Panel";
import Badge from "./Badge";

function fmtMinutesAgo(m: number): string {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtAbsolute(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-GB", {
      day:    "2-digit",
      month:  "short",
      hour:   "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

// Show the expand affordance only once the body is long enough to clamp (~3 lines).
const CLAMP_CHARS = 220;

export interface PostCardProps {
  post:            FeedPost;
  /** Render the live-only watch control. */
  watchable?:      boolean;
  isAuthed?:       boolean;
  initialWatched?: boolean;
  /** Post is linked to a published event. */
  confirmed?:      boolean;
  eventId?:        string | null;
}

/**
 * PostCard — raw source-post card. Presentational: every field is passed in by
 * the page (no data fetching, no mock). The only network call is the watch
 * toggle, which preserves the existing /api/watches POST/DELETE contract.
 */
export default function PostCard({
  post,
  watchable = false,
  isAuthed = false,
  initialWatched = false,
  confirmed = false,
  eventId = null,
}: PostCardProps) {
  const hasTranslation =
    post.translated_text !== null && post.translated_text.length > 0;

  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const body = stripHtml(
    hasTranslation && !showOriginal ? post.translated_text! : post.text,
  );
  const isLong = body.length > CLAMP_CHARS;

  const [watched, setWatched] = useState(initialWatched);
  const [pending, setPending] = useState(false);
  const [watchError, setWatchError] = useState(false);

  async function toggleWatch() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/watches", {
        method:  watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ raw_post_id: post.id }),
      });
      if (res.ok) {
        setWatched((w) => !w);
        setWatchError(false);
      } else {
        console.error("[watch-toggle] failed", res.status);
        setWatchError(true);
        setTimeout(() => setWatchError(false), 3000);
      }
    } finally {
      setPending(false);
    }
  }

  const showFooter =
    Boolean(post.source_url) || hasTranslation || watchable || (confirmed && eventId);

  const footerLink =
    "inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors";

  return (
    <Panel as="article" hover padding="sm" className="flex flex-col gap-3">
      {/* Header */}
      <header className="flex items-center gap-2">
        <span className="min-w-0 truncate font-bold text-slate-100 text-sm">
          {post.source_display}
        </span>
        <Badge variant="platform" value={post.source_platform} className="shrink-0" />
        <Badge variant="tier" value={post.source_trust} className="shrink-0" />
        <time
          className="ml-auto shrink-0 text-xs text-slate-500 font-data"
          title={fmtAbsolute(post.posted_at)}
          dateTime={post.posted_at}
        >
          {fmtMinutesAgo(post.minutes_ago)}
        </time>
      </header>

      {/* Body */}
      <div>
        <p
          className={cn(
            "text-sm text-slate-300 leading-relaxed",
            isLong && !expanded && "line-clamp-3",
          )}
        >
          {body}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>

      {/* Footer */}
      {showFooter && (
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-slate-800/60 text-xs">
          {post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={footerLink}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View source
            </a>
          )}

          {/* Translate toggle — only when an original-language version exists. */}
          {hasTranslation && (
            <button type="button" onClick={() => setShowOriginal((v) => !v)} className={footerLink}>
              {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showOriginal ? "Hide original" : "Show original"}
            </button>
          )}

          {/* live-only: confirmed link + watch, right-aligned */}
          <div className="ml-auto flex items-center gap-3">
            {watchError && (
              <span className="text-red-400 font-data text-[11px]">Failed to update</span>
            )}

            {confirmed && eventId && (
              <Link
                href={`/event/${eventId}`}
                className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <BadgeCheck className="w-3.5 h-3.5" />
                Confirmed by Sentinel
              </Link>
            )}

            {watchable &&
              (isAuthed ? (
                <button
                  type="button"
                  onClick={toggleWatch}
                  disabled={pending}
                  aria-pressed={watched}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold transition-all disabled:opacity-50",
                    watched
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600",
                  )}
                >
                  <Star className={cn("w-3.5 h-3.5", watched && "fill-current")} />
                  {watched ? "Watching" : "Watch"}
                </button>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 font-semibold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all"
                >
                  <Star className="w-3.5 h-3.5" />
                  Watch
                </Link>
              ))}
          </div>
        </footer>
      )}
    </Panel>
  );
}
