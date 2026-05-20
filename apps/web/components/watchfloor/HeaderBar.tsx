import Link from "next/link";
import SentinelMark from "./SentinelMark";

// Theater/Window chips are static visual chrome this pass.
export default function HeaderBar({
  theaterLabel,
  windowLabel,
}: {
  theaterLabel: string;
  windowLabel: string;
}) {
  return (
    <header className="bg-zinc-950/80 border-b border-zinc-900 px-5 py-3 flex items-center justify-between gap-4 flex-none">
      {/* Left cluster */}
      <div className="flex items-center gap-3 min-w-0">
        <SentinelMark className="text-amber-400/80 flex-none" size={24} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-[0.25em] uppercase text-white whitespace-nowrap">
              Sentinel Review
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-[0.2em] font-data">
              Beta
            </span>
          </div>
          <span className="text-[12px] tracking-[0.18em] uppercase text-amber-400/80">Watch Tier</span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2 text-xs font-data flex-none">
        <span className="text-zinc-500 tracking-[0.22em] uppercase text-[10px] hidden lg:inline">Theater</span>
        <span className="bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-zinc-300">{theaterLabel} ▾</span>
        <span className="text-zinc-500 tracking-[0.22em] uppercase text-[10px] hidden lg:inline">Window</span>
        <span className="bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-zinc-300">{windowLabel} ▾</span>
        <span className="flex items-center gap-1.5 ml-1">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
          </span>
          <span className="text-red-400">LIVE</span>
        </span>
        <span className="w-px h-5 bg-zinc-800 mx-1" />
        <Link
          href="/sign-in"
          className="border border-amber-500/30 bg-amber-500/[0.06] text-amber-300 px-2.5 py-1 rounded-sm tracking-[0.2em] uppercase font-data text-[10px] hover:bg-amber-500/15"
        >
          Login
        </Link>
        <Link
          href="/sign-up"
          className="border border-amber-400/50 bg-amber-500/15 text-amber-200 px-2.5 py-1 rounded-sm tracking-[0.2em] uppercase font-data text-[10px] hover:bg-amber-500/25"
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}
