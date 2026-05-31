"use client";

import { useTimeline } from "./TimelineProvider";

const HOUR_MS = 3_600_000;

function fmtUTC(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

// Evenly spaced tick labels across the window: full-span-ago … NOW.
function tickLabels(spanMs: number, n = 6): string[] {
  return Array.from({ length: n }, (_, i) => {
    const agoMs = spanMs * (1 - i / (n - 1));
    if (agoMs < HOUR_MS / 2) return "NOW";
    const hours = agoMs / HOUR_MS;
    return hours < 48 ? `−${Math.round(hours)}h` : `−${Math.round(hours / 24)}d`;
  });
}

export default function TimeScrubber() {
  const { startMs, endMs, cursorMs, playing, setCursor, toggle, toStart, toEnd } = useTimeline();

  const span = Math.max(1, endMs - startMs);
  const frac = Math.min(1, Math.max(0, (cursorMs - startMs) / span));
  const pct = frac * 100;
  const labels = tickLabels(span);

  const btn = "w-7 h-7 rounded-sm border grid place-items-center transition-colors";

  return (
    <div className="bg-navy-deep border-t border-gold/20 px-5 py-3 flex items-center gap-4 font-data text-[10px] flex-none">
      <span className="text-gold-pale/70 tracking-[0.22em] uppercase">Playback</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Jump to start"
          onClick={toStart}
          className={`${btn} border-gold/25 bg-navy-mid text-gray-light hover:text-cream hover:border-gold/40`}
        >
          ◀◀
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          onClick={toggle}
          className={`${btn} border-gold/40 bg-gold/[0.10] text-gold-pale hover:bg-gold/[0.18]`}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          aria-label="Jump to now"
          onClick={toEnd}
          className={`${btn} border-gold/25 bg-navy-mid text-gray-light hover:text-cream hover:border-gold/40`}
        >
          ▶▶
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative h-4 flex items-center">
          <div className="relative h-1 w-full rounded-full bg-navy-light">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-navy-subtle via-gold/40 to-red-alert/70"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute -top-1.5 w-1 h-4 bg-red-alert shadow-[0_0_6px_rgba(192,57,43,0.7)]"
              style={{ left: `${pct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(frac * 1000)}
            onChange={(e) => setCursor(startMs + (Number(e.target.value) / 1000) * span)}
            aria-label="Scrub timeline"
            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
          />
        </div>
        <div className="flex justify-between mt-1 text-gray-mid/60 tracking-[0.2em]">
          {labels.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>
      <span className="text-gold-pale tabular-nums w-[72px] text-right" suppressHydrationWarning>
        {fmtUTC(cursorMs)}
      </span>
    </div>
  );
}
