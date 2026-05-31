import Link from "next/link";
import { Shield, ExternalLink, Radio, FileText, MapPin } from "lucide-react";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Header({
  theaterSubtitle,
  lastUpdatedAt,
}: {
  theaterSubtitle: string;
  lastUpdatedAt: string | null;
}) {
  return (
    <header className="bg-slate-950 border-b border-red-500/20 shadow-lg shadow-red-500/5">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-xl border border-red-500/30 shadow-lg shadow-red-500/20">
              <Shield className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">SENTINEL REVIEW</h1>
                <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                  v0.2
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Open-Source Intelligence • {theaterSubtitle} • Live Feed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-4 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400">Live</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <span className="text-xs text-slate-300">Last updated: {formatRelative(lastUpdatedAt)}</span>
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

        <nav className="flex items-center gap-6 mt-4 border-t border-slate-800 pt-3">
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium">
            <MapPin className="w-4 h-4" />
            Dashboard
          </span>
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
        </nav>
      </div>
    </header>
  );
}
