// Footer playback transport. Static chrome this pass (no playback wiring).
const MARKS = ["−24h", "−18h", "−12h", "−6h", "−1h", "NOW"];

export default function TimeScrubber({ value = 92 }: { value?: number }) {
  return (
    <div className="bg-zinc-950 border-t border-zinc-800 px-5 py-3 flex items-center gap-4 font-data text-[10px] flex-none">
      <span className="text-zinc-500 tracking-[0.2em] uppercase">Playback</span>
      <div className="flex items-center gap-1">
        <span aria-hidden className="w-7 h-7 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 grid place-items-center">◀◀</span>
        <span aria-hidden className="w-7 h-7 rounded-sm border border-teal-400/30 bg-teal-400/[0.06] text-teal-300 grid place-items-center">▶</span>
        <span aria-hidden className="w-7 h-7 rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-400 grid place-items-center">▶▶</span>
      </div>
      <div className="flex-1">
        <div className="relative h-1 rounded-full bg-zinc-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-500/30 via-amber-500/30 to-red-500/60"
            style={{ width: `${value}%` }}
          />
          <div
            className="absolute -top-1.5 w-1 h-4 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]"
            style={{ left: `${value}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-zinc-600 tracking-[0.2em]">
          {MARKS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
      <span className="text-zinc-300 tabular-nums">14:42:08 UTC</span>
    </div>
  );
}
