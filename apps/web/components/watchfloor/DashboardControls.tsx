"use client";

import Link from "next/link";
import { useRef } from "react";

export interface ControlOption {
  label: string;
  href: string;
  active: boolean;
}

function HeaderDropdown({
  srLabel,
  current,
  options,
}: {
  srLabel: string;
  current: string;
  options: ControlOption[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  return (
    <details ref={ref} className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="list-none cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 hover:border-slate-500 text-xs font-semibold transition-all select-none"
        aria-label={srLabel}
      >
        {current} <span className="text-slate-400">▾</span>
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[180px] bg-slate-900 border border-slate-700 rounded-lg py-1 shadow-2xl">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            onClick={close}
            className={`block px-3 py-1.5 text-xs ${
              o.active ? "text-red-400 bg-red-500/10" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

// Slim control strip for the watchfloor: Theater + time-Window dropdowns only.
// Replaces the old HeaderBar, whose brand cluster + nav links are now handled
// by the global SiteHeader.
export default function DashboardControls({
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
    <div className="bg-slate-950/80 border-b border-slate-800 flex-none">
      <div className="px-6 py-2 flex items-center justify-end gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="hidden xl:inline text-[10px] text-slate-500 uppercase tracking-wider">
            Theater
          </span>
          <HeaderDropdown
            srLabel="Select theater"
            current={theaterLabel}
            options={theaterOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden xl:inline text-[10px] text-slate-500 uppercase tracking-wider">
            Window
          </span>
          <HeaderDropdown
            srLabel="Select time window"
            current={windowLabel}
            options={windowOptions}
          />
        </div>
      </div>
    </div>
  );
}
