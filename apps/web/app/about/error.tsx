"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function AboutError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[/about] render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-amber-500/30 rounded-xl p-8 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/30 flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-100 mb-1">
              About page temporarily unavailable
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Try again in a moment, or head back to the dashboard.
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
  );
}
