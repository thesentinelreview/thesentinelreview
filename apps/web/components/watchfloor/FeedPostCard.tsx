"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ExternalLink, Star, Clock } from "lucide-react";
import type { FeedPost } from "@/lib/queries";
import type { Platform } from "@/lib/types";
import { stripHtml } from "@/lib/text";

const PLATFORM_STYLE: Record<Platform, { label: string; cls: string }> = {
  rss:      { label: "RSS",      cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" },
  x:        { label: "X",        cls: "bg-sky-500/10 border-sky-500/30 text-sky-300" },
  telegram: { label: "Telegram", cls: "bg-blue-500/10 border-blue-500/30 text-blue-300" },
  bluesky:  { label: "Bluesky",  cls: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" },
  wire:     { label: "Wire",     cls: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
};

const TIER_STYLE: Record<1 | 2 | 3, string> = {
  1: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  2: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  3: "bg-slate-700/30 border-slate-600/40 text-slate-300",
};

const BODY_COLLAPSE_CHARS = 280;

function fmtMinutesAgo(m: number): string {
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day:    "2-digit",
    month:  "short",
    hour:   "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export default function FeedPostCard({
  post,
  isNewest = false,
  isAuthed = false,
  initialWatched = false,
  confirmed = false,
  eventId = null,
}: {
  post: FeedPost;
  isNewest?: boolean;
  isAuthed?: boolean;
  initialWatched?: boolean;
  confirmed?: boolean;
  eventId?: string | null;
}) {
  const hasTranslation = post.translated_text !== null && post.translated_text.length > 0;
  const isEnglish = post.lang === "en";
  const translationUnavailable = !isEnglish && !hasTranslation;

  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const body = stripHtml(hasTranslation && !showOriginal ? post.translated_text! : post.text);
  const isLong = body.length > BODY_COLLAPSE_CHARS;

  const [watched, setWatched] = useState(initialWatched);
  const [pending, setPending] = useState(false);
  const [watchError, setWatchError] = useState(false);

  async function toggleWatch() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/watches", {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_post_id: post.id }),
      });
      if (res.ok) {
        setWatched((w) => !w);
        setWatchError(false);
      } else {
        setWatchError(true);
        setTimeout(() => setWatchError(false), 3000);
      }
    } finally {
      setPending(false);
    }
  }

  const platform = PLATFORM_STYLE[post.source_platform];
  const tierCls  = TIER_STYLE[post.source_trust];

  return (
    <article className="relative py-4 first:pt-0 last:pb-0">
      {isNewest && (
        <div className="absolute -top-2 right-0 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow-lg">
          New
        </div>
      )}

      <header className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-bold text-slate-100 text-sm truncate">{post.source_display}</span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${platform.cls}`}
          >
            {platform.label}
          </span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${tierCls}`}
          >
            Tier {post.source_trust}
          </span>
          {confirmed && eventId ? (
            <Link
              href={`/event/${eventId}`}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
            >
              <ShieldCheck className="w-3 h-3" />
              Verified
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-slate-700/30 border-slate-600/40 text-slate-400">
              <ShieldAlert className="w-3 h-3" />
              Unverified
            </span>
          )}
        </div>
        <div
          title={fmtAbsolute(post.posted_at)}
          className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 flex-none"
        >
          <Clock className="w-3 h-3" />
          {fmtMinutesAgo(post.minutes_ago)}
        </div>
      </header>

      {translationUnavailable && (
        <div className="mb-2">
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-amber-500/10 border-amber-500/30 text-amber-300">
            Translation unavailable
          </span>
        </div>
      )}

      <p
        className={`text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {body}
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
        <div className="flex items-center gap-3 flex-wrap">
          {post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View source
            </a>
          )}
          {hasTranslation && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline-offset-2 hover:underline"
            >
              {showOriginal ? "Show translation" : "Show original"}
            </button>
          )}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline-offset-2 hover:underline"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {watchError && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              Failed to update
            </span>
          )}
          {isAuthed ? (
            <button
              type="button"
              onClick={toggleWatch}
              disabled={pending}
              aria-pressed={watched}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider rounded border transition-colors disabled:opacity-50 ${
                watched
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                  : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
              }`}
            >
              <Star
                className={`w-3 h-3 ${watched ? "fill-amber-300" : ""}`}
              />
              {watched ? "Watching" : "Watch"}
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Star className="w-3 h-3" />
              Watch
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
