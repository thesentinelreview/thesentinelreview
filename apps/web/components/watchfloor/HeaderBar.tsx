"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { ExternalLink, Radio, FileText, MapPin, Shield } from "lucide-react";
import SentinelBrand from "./SentinelBrand";
import SensorStrip from "./SensorStrip";
import type { SensorStripData } from "@/lib/types";
import type { Tier } from "@/lib/entitlements-core";

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

export default function HeaderBar({
  theaterLabel,
  windowLabel,
  theaterOptions,
  windowOptions,
  feedHref,
  watchHref = "/",
  currentView = "watchfloor",
  sensorData,
  isAuthed = false,
  tier,
  showAdmin = false,
  exportControl,
}: {
  theaterLabel: string;
  windowLabel?: string;
  theaterOptions: ControlOption[];
  windowOptions?: ControlOption[];
  feedHref: string;
  watchHref?: string;
  currentView?: "watchfloor" | "feed" | "static";
  sensorData: SensorStripData;
  isAuthed?: boolean;
  tier?: Tier;
  /** isAdmin() allowlist result, resolved server-side by the page. */
  showAdmin?: boolean;
  /** Export control slot (W2-2) — the page passes it only for canExport
   * viewers, so watch/anonymous never render it. */
  exportControl?: ReactNode;
}) {
  const isFeed = currentView === "feed";
  const isStatic = currentView === "static";
  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Brand cluster — shared SENTINEL INTELLIGENCE block */}
          <SentinelBrand tier={tier} />

          {/* Right cluster — page links, controls, auth */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {isStatic ? (
              <>
                <Link
                  href={watchHref}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  Sentinel View
                </Link>
                <Link
                  href={feedHref}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  <Radio className="w-4 h-4" />
                  Source Feed
                </Link>
              </>
            ) : isFeed ? (
              <>
                <Link
                  href={watchHref}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  Sentinel View
                </Link>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium">
                  <Radio className="w-4 h-4" />
                  Source Feed
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium">
                  <MapPin className="w-4 h-4" />
                  Sentinel View
                </span>
                <Link
                  href={feedHref}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  <Radio className="w-4 h-4" />
                  Source Feed
                </Link>
              </>
            )}
            <Link
              href="/sources"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
            >
              <Radio className="w-4 h-4" />
              Sources
            </Link>
            <Link
              href="/methodology"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              Methodology
            </Link>
            {showAdmin && (
              <Link
                href="/admin/grants"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-amber-400/90 hover:text-amber-300 text-sm transition-colors"
              >
                <Shield className="w-4 h-4" />
                Admin
              </Link>
            )}

            <div className="flex items-center gap-2">
              <span className="hidden xl:inline text-[10px] text-slate-500 uppercase tracking-wider">Theater</span>
              <HeaderDropdown srLabel="Select theater" current={theaterLabel} options={theaterOptions} />
              {windowOptions && windowOptions.length > 0 && windowLabel && (
                <>
                  <span className="hidden xl:inline text-[10px] text-slate-500 uppercase tracking-wider">Window</span>
                  <HeaderDropdown srLabel="Select time window" current={windowLabel} options={windowOptions} />
                </>
              )}
              {exportControl}
            </div>

            <a
              href="https://thesentinelreview.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all text-sm border border-slate-600 hover:border-slate-500"
            >
              <span>Main Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
              {isAuthed ? (
                <UserButton />
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 border border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/15"
                  >
                    Login
                  </Link>
                  <Link
                    href="/sign-up"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-200 border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WATCH TIER sensor strip sits where the Sources/Methodology nav used to live. */}
      <SensorStrip data={sensorData} />
    </header>
  );
}
