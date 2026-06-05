'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Diamond, ExternalLink } from 'lucide-react';

const NAV = [
  { label: 'Map', href: '/' },
  { label: 'Theaters', href: '/theaters' },
  { label: 'Source Feed', href: '/app/feed' },
  { label: 'Sources', href: '/sources' },
  { label: 'Methodology', href: '/methodology' },
  { label: 'About', href: '/about' },
  { label: 'Pricing', href: '/pricing' },
];

export function SiteHeader({ isAuthed = false }: { isAuthed?: boolean }) {
  const pathname = usePathname() || '/';
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5">
      <div className="max-w-[1800px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Brand: diamond logo + wordmark */}
          <Link href="/" className="group flex items-center gap-3 shrink-0">
            <span className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-lg border border-amber-500/30 shadow-lg shadow-amber-500/20 flex items-center justify-center">
              <Diamond className="w-5 h-5 text-amber-400" />
            </span>
            <span className="text-2xl font-bold tracking-[0.25em] uppercase whitespace-nowrap">
              <span className="text-white">Sentinel </span>
              <span className="text-red-400 group-hover:text-red-300 transition-colors">Review</span>
            </span>
          </Link>

          {/* Desktop nav (lg and up) */}
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap bg-red-500/10 border border-red-500/30 text-red-400'
                      : 'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right cluster: live / main site / auth */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-700 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Live</span>
            </span>

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
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 border border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/15 transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    href="/sign-up"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-200 border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/25 transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tablet / mobile nav (below lg): wraps onto its own row */}
        <nav
          aria-label="Primary"
          className="flex lg:hidden items-center gap-1 flex-wrap mt-3 pt-3 border-t border-slate-800"
        >
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'px-2.5 py-1 rounded-md text-xs whitespace-nowrap text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
