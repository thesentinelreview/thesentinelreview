"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";

// Customer exports (W2-2). Rendered only for canExport viewers — the page
// decides server-side; the route re-checks entitlements regardless. Exports
// the currently applied filters: the active theater always, and the active
// window by default (wider windows / a custom range ≤90 days are offered here
// because the page itself only surfaces 24H/7D).
const WINDOW_CHOICES = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "custom", label: "Custom" },
] as const;

type WindowChoice = (typeof WINDOW_CHOICES)[number]["value"];

const MAX_SPAN_DAYS = 90;

export default function ExportControl({
  theater,
  activeWindow,
}: {
  theater: string;
  activeWindow: "24h" | "7d" | "30d";
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [windowChoice, setWindowChoice] = useState<WindowChoice>(activeWindow);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customReady = windowChoice !== "custom" || (!!customStart && !!customEnd);

  function buildUrl(format: "csv" | "json"): string {
    const p = new URLSearchParams({ theater, format });
    if (windowChoice === "custom") {
      // Date inputs are calendar days; export the full days, UTC.
      p.set("start", `${customStart}T00:00:00.000Z`);
      p.set("end", `${customEnd}T23:59:59.999Z`);
    } else {
      p.set("window", windowChoice);
    }
    return `/api/export/events?${p}`;
  }

  async function download(format: "csv" | "json") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(format));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Export failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? `sentinel-events-${theater}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      ref.current?.removeAttribute("open");
    } catch {
      setError("Export failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={ref} className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="list-none cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 hover:border-slate-500 text-xs font-semibold transition-all select-none"
        aria-label="Export events"
      >
        <Download className="w-3.5 h-3.5" />
        Export <span className="text-slate-400">▾</span>
      </summary>
      <div className="absolute right-0 mt-1 z-50 w-[260px] bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-2xl flex flex-col gap-3">
        <div className="text-[10px] font-data tracking-[0.18em] uppercase text-slate-500">
          Export events — {theater}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-data tracking-[0.12em] uppercase text-slate-500">
            Window
          </span>
          <div className="flex flex-wrap gap-1">
            {WINDOW_CHOICES.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => setWindowChoice(w.value)}
                className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                  windowChoice === w.value
                    ? "border-red-500/40 bg-red-500/10 text-red-400"
                    : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {windowChoice === "custom" && (
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                From
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 [color-scheme:dark]"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                To
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 [color-scheme:dark]"
                />
              </label>
              <span className="text-[10px] text-slate-500">Up to {MAX_SPAN_DAYS} days per export.</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {(["csv", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={busy || !customReady}
              onClick={() => download(format)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold uppercase tracking-wider border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3" />
              {busy ? "…" : format}
            </button>
          ))}
        </div>

        {error && <div className="text-[11px] leading-snug text-amber-400">{error}</div>}

        <div className="text-[10px] leading-snug text-slate-500">
          Confidence-labeled OSINT; not all events verified. Personal and internal-org use only —
          no redistribution. 10,000 rows/file.
        </div>
      </div>
    </details>
  );
}
