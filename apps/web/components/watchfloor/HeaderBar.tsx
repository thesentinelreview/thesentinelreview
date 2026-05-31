"use client";

import Link from "next/link";
import { useRef } from "react";
import { UserButton } from "@clerk/nextjs";
import SentinelMark from "./SentinelMark";

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
        className="list-none cursor-pointer bg-navy-mid border border-gold/25 rounded-sm px-2 py-1 text-cream font-data select-none hover:border-gold/45"
        aria-label={srLabel}
      >
        {current} ▾
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[150px] bg-navy-mid border border-gold/25 rounded-sm py-1 shadow-xl">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            onClick={close}
            className={`block px-3 py-1.5 text-[11px] tracking-[0.08em] ${
              o.active ? "text-gold-pale bg-gold/[0.08]" : "text-gray-light hover:bg-navy-light/60"
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
  feedHref,
  isAuthed = false,
}: {
  theaterLabel: string;
  windowLabel: string;
  theaterOptions: ControlOption[];
  windowOptions: ControlOption[];
  feedHref: string;
  isAuthed?: boolean;
}) {
  return (
    <header className="bg-navy-deep/85 border-b border-gold/20 px-4 sm:px-5 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 flex-none">
      {/* Left cluster */}
      <div className="flex items-center gap-3 min-w-0">
        <SentinelMark
          className="flex-none text-gold drop-shadow-[0_0_4px_rgba(184,136,42,0.32)] transition-[color,filter] hover:text-gold-bright hover:drop-shadow-[0_0_6px_rgba(212,164,58,0.38)]"
          size={24}
        />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-display font-bold tracking-[0.12em] uppercase text-cream">
              Sentinel Intelligence
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold-pale border border-gold/30 uppercase tracking-[0.2em] font-data">
              Beta
            </span>
          </div>
          <span className="hidden sm:inline-block self-start mt-0.5 border border-gold px-1.5 py-0.5 text-[10px] tracking-[0.22em] uppercase text-gold-pale font-data">
            Watch Tier
          </span>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-data min-w-0">
        {/* Mode toggle — Sentinel View (this page) ↔ Source Feed */}
        <div className="flex items-center rounded-sm border border-gold/25 bg-navy-mid/60 overflow-hidden mr-1">
          <span
            aria-current="page"
            className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase bg-gold/[0.12] text-gold-pale border-r border-gold/25"
          >
            <span className="hidden sm:inline">Sentinel </span>View
          </span>
          <Link
            href={feedHref}
            className="px-2.5 py-1 text-[10px] font-data tracking-[0.18em] uppercase text-gray-light hover:text-cream hover:bg-navy-light/60 transition-colors"
          >
            <span className="hidden sm:inline">Source </span>Feed
          </Link>
        </div>
        <span className="text-gold-pale/70 tracking-[0.22em] uppercase text-[10px] hidden lg:inline">Theater</span>
        <HeaderDropdown srLabel="Select theater" current={theaterLabel} options={theaterOptions} />
        <span className="text-gold-pale/70 tracking-[0.22em] uppercase text-[10px] hidden lg:inline">Window</span>
        <HeaderDropdown srLabel="Select time window" current={windowLabel} options={windowOptions} />
        <span className="flex items-center gap-1.5 ml-1">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-red-alert opacity-75" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-red-alert" />
          </span>
          <span className="text-red-alert tracking-[0.18em]">LIVE</span>
        </span>
        <div className="hidden sm:flex items-center gap-2">
          <span className="w-px h-5 bg-gold/25 mx-1" />
          {isAuthed ? (
            <UserButton />
          ) : (
            <>
              <Link
                href="/sign-in"
                className="border border-gold/30 bg-gold/[0.06] text-gold-pale px-2.5 py-1 rounded-sm tracking-[0.2em] uppercase font-data text-[10px] hover:bg-gold/15"
              >
                Login
              </Link>
              <Link
                href="/sign-up"
                className="border border-gold/50 bg-gold/[0.15] text-gold-bright px-2.5 py-1 rounded-sm tracking-[0.2em] uppercase font-data text-[10px] hover:bg-gold/25"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
