"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

// Route-level error boundary for /app/feed. Any render-time error from the
// page or its children (HeaderBar, FeedPostCard, SensorStrip, etc.) lands
// here and degrades to an honest unavailable state instead of a 500. The
// full Error (including stack + property name) is console.error'd so the
// underlying cause shows up in Vercel runtime logs the next time it fires.
export default function FeedError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[/app/feed] render error:", error);
  }, [error]);

  return (
    <div className="watchfloor-root flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
          <section className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-amber-500/30 rounded-xl p-8 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/30 flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-slate-100 mb-1">Source Feed unavailable</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  The feed could not be rendered right now. The dashboard map and briefing remain
                  available; the feed will return once the underlying issue is resolved.
                </p>
                {error?.digest && (
                  <p className="mt-3 text-[11px] font-mono text-slate-500">
                    error digest: {error.digest}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => unstable_retry()}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    Try again
                  </button>
                  <Link
                    href="/"
                    className="px-3 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold uppercase tracking-wider transition-colors"
                  >
                    Back to dashboard
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
