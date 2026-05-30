"use client";

import { useEffect, useRef, useState } from "react";
import SentinelMark from "./SentinelMark";

const SESSION_KEY = "sentinel:intro-seen";
const EXIT_DELAY_MS = 1600;

type Phase = "enter" | "exit";

export default function BootSequence() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("enter");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alreadySeen = window.sessionStorage.getItem(SESSION_KEY) === "1";

    if (reducedMotion || alreadySeen) {
      window.sessionStorage.setItem(SESSION_KEY, "1");
      return;
    }

    window.sessionStorage.setItem(SESSION_KEY, "1");
    setMounted(true);

    timerRef.current = window.setTimeout(() => {
      setPhase("exit");
    }, EXIT_DELAY_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase("exit");
    };
    window.addEventListener("keydown", onKey);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      onPointerDown={() => setPhase("exit")}
      onAnimationEnd={(e) => {
        if (e.animationName === "sentinel-overlay-out") setMounted(false);
      }}
      className={`sentinel-boot fixed inset-0 z-[9999] bg-[#05070A] flex items-center justify-center overflow-hidden cursor-pointer ${
        phase === "exit" ? "sentinel-boot-exit" : ""
      }`}
    >
      {/* HUD grid — draws in with stroke-dashoffset */}
      <svg
        className="absolute inset-0 w-full h-full text-amber-400/25"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[20, 50, 80].map((x, i) => (
          <line
            key={`v${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="100"
            stroke="currentColor"
            strokeWidth="0.15"
            vectorEffect="non-scaling-stroke"
            className="sentinel-boot-line"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: 100,
              animationDelay: `${i * 40}ms`,
            }}
          />
        ))}
        {[20, 50, 80].map((y, i) => (
          <line
            key={`h${y}`}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="currentColor"
            strokeWidth="0.15"
            vectorEffect="non-scaling-stroke"
            className="sentinel-boot-line"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: 100,
              animationDelay: `${120 + i * 40}ms`,
            }}
          />
        ))}
      </svg>

      {/* Corner brackets — CSS divs with borders, scale-in for the draw */}
      <div className="absolute top-3 left-3 w-6 h-6 border-t border-l border-amber-400 sentinel-boot-bracket" style={{ animationDelay: "260ms" }} />
      <div className="absolute top-3 right-3 w-6 h-6 border-t border-r border-amber-400 sentinel-boot-bracket" style={{ animationDelay: "320ms" }} />
      <div className="absolute bottom-3 left-3 w-6 h-6 border-b border-l border-amber-400 sentinel-boot-bracket" style={{ animationDelay: "380ms" }} />
      <div className="absolute bottom-3 right-3 w-6 h-6 border-b border-r border-amber-400 sentinel-boot-bracket" style={{ animationDelay: "440ms" }} />

      {/* Wordmark + subtext stack */}
      <div className="relative flex flex-col items-center gap-4 px-6 text-center">
        <div className="sentinel-boot-mark text-amber-400 drop-shadow-[0_0_8px_rgba(244,162,97,0.35)]">
          <SentinelMark size={56} className="text-amber-400" />
        </div>
        <div className="sentinel-boot-wordmark">
          <span className="block text-white text-[clamp(18px,3vw,28px)] font-bold tracking-[0.25em] uppercase">
            Sentinel Intelligence
          </span>
        </div>
        <div className="sentinel-boot-subtext">
          <span className="block font-data text-amber-400 text-[10px] sm:text-[11px] tracking-[0.22em] uppercase">
            // Initializing Theater Feeds
          </span>
        </div>
        <div className="sentinel-boot-hint">
          <span className="block font-data text-zinc-500 text-[9px] sm:text-[10px] tracking-[0.2em] uppercase mt-6">
            Tap or press Esc to skip
          </span>
        </div>
      </div>
    </div>
  );
}
