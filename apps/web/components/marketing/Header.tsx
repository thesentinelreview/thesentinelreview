"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ExternalLink,
  Radio,
  FileText,
  MapPin,
  Globe,
  Info,
} from "lucide-react";

const NAV: { label: string; href: string; icon: typeof MapPin; match: (p: string) => boolean }[] = [
  { label: "Dashboard",   href: "/",            icon: MapPin,   match: (p) => p === "/" },
  { label: "Theaters",    href: "/theaters",    icon: Globe,    match: (p) => p.startsWith("/theaters") },
  { label: "Sources",     href: "/sources",     icon: Radio,    match: (p) => p === "/sources" },
  { label: "Methodology", href: "/methodology", icon: FileText, match: (p) => p === "/methodology" },
  { label: "About",       href: "/about",       icon: Info,     match: (p) => p === "/about" },
];

// Shared header for the marketing / reference pages (Theaters, Sources, About,
// per-theater). Port of the src-6 Header — owl wordmark + nav row. The
// dashboard and methodology pages keep their existing watchfloor HeaderBar.
export default function MarketingHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="p-2.5 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-xl border border-amber-500/30 shadow-lg shadow-amber-500/20 text-3xl leading-none flex items-center justify-center"
              aria-hidden="true"
            >
              🦉
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  SENTINEL INTELLIGENCE MAP
                </h1>
                <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                  Beta
                </span>
              </div>
              <p className="text-sm text-amber-500/80 mt-0.5 uppercase tracking-wider font-semibold">
                Watch Tier
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Live</span>
            </div>

            <a
              href="https://thesentinelreview.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all text-sm border border-slate-600 hover:border-slate-500"
            >
              <span>Main Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <nav className="flex items-center gap-2 mt-4 border-t border-slate-800 pt-3 flex-wrap">
          {NAV.map(({ label, href, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium"
                    : "flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
