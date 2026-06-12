"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Mirrors GlobalHeader's chrome split: operational views — "/" (watchfloor),
// /app/* (feed), /embed/* (bare iframe widgets) — render their own integrated
// chrome and carry the legal links inside it (watchfloor disclaimer strip,
// feed footnote), so the global legal footer mounts on content / marketing
// routes only.
export default function GlobalFooter() {
  const pathname = usePathname() || "/";
  const isOperational =
    pathname === "/" || pathname.startsWith("/app/") || pathname.startsWith("/embed/");
  if (isOperational) return null;

  return (
    <footer className="w-full border-t border-slate-800/60">
      <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>© 2026 Sentinel Media Group, LLC</span>
        <span className="text-slate-700">·</span>
        <Link href="/terms" className="hover:text-amber-400">
          Terms of Service
        </Link>
        <span className="text-slate-700">·</span>
        <Link href="/privacy" className="hover:text-amber-400">
          Privacy Policy
        </Link>
        <span className="text-slate-700">·</span>
        <a href="mailto:contact@thesentinelreview.com" className="hover:text-amber-400">
          Contact
        </a>
      </div>
    </footer>
  );
}
