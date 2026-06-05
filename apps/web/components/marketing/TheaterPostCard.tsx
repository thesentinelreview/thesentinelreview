"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import type { FeedPost } from "@/lib/queries";
import type { Platform } from "@/lib/types";
import { stripHtml } from "@/lib/text";

const PLATFORM_STYLE: Record<Platform, { label: string; cls: string }> = {
  rss:      { label: "RSS",      cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  x:        { label: "X",        cls: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  telegram: { label: "Telegram", cls: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  bluesky:  { label: "Bluesky",  cls: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  wire:     { label: "Wire",     cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

const TIER_STYLE: Record<1 | 2 | 3, string> = {
  1: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  2: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  3: "text-slate-400 bg-slate-700/30 border-slate-600/40",
};

const PLATFORM_FALLBACK_CLS = "text-slate-300 bg-slate-700/30 border-slate-600/40";
const BODY_COLLAPSE_CHARS = 240;

function fmtMinutesAgo(m: number): string {
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TheaterPostCard({ post }: { post: FeedPost }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasTranslation =
    typeof post.translated_text === "string" && post.translated_text.length > 0;
  const isEnglish = post.lang === "en";
  const rawBody =
    showOriginal && hasTranslation
      ? post.text ?? ""
      : hasTranslation
        ? post.translated_text ?? ""
        : post.text ?? "";
  const body = stripHtml(rawBody);
  const isLong = body.length > BODY_COLLAPSE_CHARS;

  const platformLabel =
    PLATFORM_STYLE[post.source_platform]?.label ??
    (typeof post.source_platform === "string" && post.source_platform.length > 0
      ? post.source_platform.toUpperCase()
      : "Source");
  const platformCls =
    PLATFORM_STYLE[post.source_platform]?.cls ?? PLATFORM_FALLBACK_CLS;
  const tier =
    post.source_trust === 1 || post.source_trust === 2 || post.source_trust === 3
      ? post.source_trust
      : 2;
  const tierCls = TIER_STYLE[tier];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-5 shadow-xl hover:border-slate-600 transition-all">
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <span className="font-bold text-slate-100 text-sm">
          {post.source_display}
        </span>
        <span
          className={`px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${platformCls}`}
        >
          {platformLabel}
        </span>
        <span
          className={`px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider ${tierCls}`}
        >
          Tier {tier}
        </span>
        <span className="ml-auto text-xs text-slate-500 font-mono">
          {fmtMinutesAgo(post.minutes_ago)}
        </span>
      </div>

      <p
        className={`text-sm text-slate-300 leading-relaxed mb-3 whitespace-pre-wrap break-words ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {body}
      </p>

      <div className="flex items-center gap-4 pt-3 border-t border-slate-800/60 flex-wrap">
        {post.source_url && (
          <a
            href={post.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            view source
          </a>
        )}
        {hasTranslation && !isEnglish && (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            {showOriginal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showOriginal ? "Hide original" : "Show original"}
          </button>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Expand
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
