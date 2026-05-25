"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface TimelineState {
  startMs: number; // oldest edge of the window
  endMs: number; // "now", frozen at mount
  cursorMs: number; // current playhead
  playing: boolean;
  setCursor: (ms: number) => void;
  toggle: () => void;
  toStart: () => void;
  toEnd: () => void;
}

// When there is no provider (e.g. the standalone embed map), the cursor sits at
// +Infinity so every event passes the `occurred_at <= cursor` filter — i.e. the
// map behaves exactly as it did before the scrubber existed.
const NO_TIMELINE: TimelineState = {
  startMs: 0,
  endMs: Infinity,
  cursorMs: Infinity,
  playing: false,
  setCursor: () => {},
  toggle: () => {},
  toStart: () => {},
  toEnd: () => {},
};

const TimelineCtx = createContext<TimelineState | null>(null);

export function useTimeline(): TimelineState {
  return useContext(TimelineCtx) ?? NO_TIMELINE;
}

const PLAYBACK_SECONDS = 24; // wall-clock time to play the whole window
const TICK_MS = 100;

export default function TimelineProvider({
  windowMs,
  children,
}: {
  windowMs: number;
  children: ReactNode;
}) {
  // Anchor "now" to mount so the right edge is stable for the session.
  const endMs = useRef(Date.now()).current;
  const startMs = endMs - windowMs;

  const [cursorMs, setCursorMs] = useState(endMs);
  const [playing, setPlaying] = useState(false);

  function setCursor(ms: number) {
    setPlaying(false);
    setCursorMs(Math.min(endMs, Math.max(startMs, ms)));
  }
  function toStart() {
    setCursor(startMs);
  }
  function toEnd() {
    setCursor(endMs);
  }
  function toggle() {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Replay from the start if the playhead is already parked at the end.
    setCursorMs((c) => (c >= endMs ? startMs : c));
    setPlaying(true);
  }

  // Advance the playhead while playing.
  useEffect(() => {
    if (!playing) return;
    const step = windowMs / (PLAYBACK_SECONDS * (1000 / TICK_MS));
    const id = setInterval(() => {
      setCursorMs((c) => Math.min(endMs, c + step));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, windowMs, endMs]);

  // Stop once the playhead reaches the end.
  useEffect(() => {
    if (playing && cursorMs >= endMs) setPlaying(false);
  }, [playing, cursorMs, endMs]);

  return (
    <TimelineCtx.Provider value={{ startMs, endMs, cursorMs, playing, setCursor, toggle, toStart, toEnd }}>
      {children}
    </TimelineCtx.Provider>
  );
}
