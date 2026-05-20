import Link from "next/link";
import SentinelMark from "./SentinelMark";

export interface ControlOption {
  label: string;
  href: string;
  active: boolean;
}

// Native disclosure dropdown — no client JS. Options are links that set URL params.
function HeaderDropdown({
  srLabel,
  current,
  options,
}: {
  srLabel: string;
  current: string;
  options: ControlOption[];
}) {
  return (
    <details className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="list-none cursor-pointer bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-zinc-300 select-none hover:border-zinc-700"
        aria-label={srLabel}
      >
        {current} ▾
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[150px] bg-zinc-900 border border-zinc-800 rounded-sm py-1 shadow-xl">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            className={`block px-3 py-1.5 text-[11px] tracking-[0.08em] ${
              o.active ? "text-amber-300 bg-amber-500/[0.06]" : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export default function HeaderBar({
  theaterLabel,
  windowLabel,
  theaterOptions,
  windowOptions,
}: {
  theaterLabel: string;
  windowLabel: string;
  theaterOptions: ControlOption[];
  windowOptions: ControlOption[];
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
        <HeaderDropdown srLabel="Select theater" current={theaterLabel} options={theaterOptions} />
        <span className="text-zinc-500 tracking-[0.22em] uppercase text-[10px] hidden lg:inline">Window</span>
        <HeaderDropdown srLabel="Select time window" current={windowLabel} options={windowOptions} />
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
