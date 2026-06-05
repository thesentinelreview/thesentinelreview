"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ExternalLink } from "lucide-react";

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
// layout. The dashboard's old SENTINEL INTELLIGENCE / owl / Watch Tier
// chrome and the per-page nav strips are replaced by this one header.
export default function SiteHeader({ isAuthed }: { isAuthed: boolean }) {
  const pathname = usePathname() ?? "/";

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5 flex-none">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="group flex items-center min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-[0.25em] uppercase whitespace-nowrap">
                Sentinel <span className="text-red-400 group-hover:text-red-300 transition-colors">Review</span>
              </h1>
            </Link>

            <nav aria-label="Primary" className="hidden md:flex items-center gap-1 flex-wrap">
              {NAV.map(({ label, href }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium"
                        : "px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-sm transition-colors"
                    }
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

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

        {/* Mobile nav — wraps to a second row below the brand */}
        <nav aria-label="Primary (mobile)" className="flex md:hidden items-center gap-1 flex-wrap mt-3 pt-3 border-t border-slate-800">
          {NAV.map(({ label, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium"
                    : "px-2.5 py-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-300 text-xs transition-colors"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
