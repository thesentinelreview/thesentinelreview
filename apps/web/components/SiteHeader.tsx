"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Diamond, ExternalLink } from "lucide-react";

const NAV: { label: string; href: string }[] = [
  { label: "Map",         href: "/" },
  { label: "Theaters",    href: "/theaters" },
  { label: "Source Feed", href: "/app/feed" },
  { label: "Sources",     href: "/sources" },
  { label: "Methodology", href: "/methodology" },
  { label: "About",       href: "/about" },
  { label: "Pricing",     href: "/pricing" },
];

// Single shared header for the whole app, rendered globally from the root
// layout. Identical markup on every route — the active-state colour is the
// only per-route difference, driven by usePathname.
export default function SiteHeader({ isAuthed }: { isAuthed: boolean }) {
  const pathname = usePathname() ?? "/";

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-lg border border-amber-500/30 flex items-center justify-center">
              <Diamond className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xl font-bold tracking-[0.2em] whitespace-nowrap">
              <span className="text-white">SENTINEL</span>{" "}
              <span className="text-red-500">REVIEW</span>
            </span>
          </Link>

          {/* Nav */}
          <nav aria-label="Primary" className="flex items-center gap-1 flex-wrap">
            {NAV.map(({ label, href }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium"
                      : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-sm transition-colors"
                  }
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-700 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Live</span>
            </div>

            <a
              href="https://thesentinelreview.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-all text-sm border border-slate-600 hover:border-slate-500"
            >
              <span>Main Site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

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
    </header>
  );
}
