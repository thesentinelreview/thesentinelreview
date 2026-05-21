"use client";

import { useState } from "react";
import Link from "next/link";
import type { FeedPost } from "@/lib/queries";
import s from "./PostCard.module.css";

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
    day:   "2-digit",
    month: "short",
    hour:  "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

function platformLabel(p: FeedPost["source_platform"]): string {
  return p === "x" ? "X" : p === "rss" ? "RSS" : p === "wire" ? "Wire" : "Telegram";
}

export default function PostCard({
  post,
  watchable = false,
  isAuthed = false,
  initialWatched = false,
  confirmed = false,
  eventId = null,
}: {
  post: FeedPost;
  watchable?: boolean;
  isAuthed?: boolean;
  initialWatched?: boolean;
  confirmed?: boolean;
  eventId?: string | null;
}) {
  const hasTranslation = post.translated_text !== null && post.translated_text.length > 0;
  const isEnglish = post.lang === "en";
  const translationUnavailable = !isEnglish && !hasTranslation;

  const [showOriginal, setShowOriginal] = useState(false);
  const body = hasTranslation && !showOriginal ? post.translated_text! : post.text;

  const [watched, setWatched] = useState(initialWatched);
  const [pending, setPending] = useState(false);

  async function toggleWatch() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/watches", {
        method: watched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_post_id: post.id }),
      });
      if (res.ok) setWatched((w) => !w);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className={s.card}>
      <header className={s.head}>
        <div className={s.source}>
          <span className={s.handle}>{post.source_display}</span>
          <span className={s.dot}>·</span>
          <span className={s.platform}>{platformLabel(post.source_platform)}</span>
          <span className={s.dot}>·</span>
          <span className={s.trust}>tier {post.source_trust}</span>
        </div>
        <div className={s.timestamp} title={fmtAbsolute(post.posted_at)}>
          {fmtMinutesAgo(post.minutes_ago)}
        </div>
      </header>

      {(hasTranslation || translationUnavailable) && (
        <div className={s.badgeRow}>
          {hasTranslation && (
            <span className={s.badge}>
              {showOriginal
                ? `Original · ${post.lang ?? "unknown"}`
                : `Translated from ${post.lang ?? "unknown"}`}
            </span>
          )}
          {translationUnavailable && (
            <span className={`${s.badge} ${s.badgeWarn}`}>
              Translation unavailable
            </span>
          )}
          {hasTranslation && (
            <button
              type="button"
              className={s.toggle}
              onClick={() => setShowOriginal((v) => !v)}
            >
              {showOriginal ? "Show translation" : "Show original"}
            </button>
          )}
        </div>
      )}

      <div className={s.body}>{body}</div>

      {watchable && (
        <div className={s.actions}>
          {isAuthed ? (
            <button
              type="button"
              className={`${s.watchBtn} ${watched ? s.watchBtnOn : ""}`}
              onClick={toggleWatch}
              disabled={pending}
              aria-pressed={watched}
            >
              {watched ? "★ Watching" : "☆ Watch"}
            </button>
          ) : (
            <Link href="/sign-in" className={s.watchBtn}>
              ☆ Watch
            </Link>
          )}
          {confirmed && eventId && (
            <Link href={`/event/${eventId}`} className={`${s.badge} ${s.badgeConfirmed}`}>
              ✓ Confirmed by Sentinel
            </Link>
          )}
        </div>
      )}

      {post.source_url && (
        <footer className={s.foot}>
          <a
            href={post.source_url}
            className={s.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            View source ↗
          </a>
        </footer>
      )}
    </article>
  );
}
