import type { ReactNode } from "react";

// Shared bordered pane chrome (the design's "V5Pane"): a header with an
// optional numeric tag + title + sub-label, over a scrollable body.
export default function Pane({
  tag,
  title,
  sub,
  accent,
  className = "",
  children,
}: {
  tag?: string;
  title: string;
  sub?: ReactNode;
  accent?: "teal";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col bg-zinc-950/60 border border-zinc-900 rounded-sm overflow-hidden min-h-0 ${className}`}
    >
      <header className="px-3 py-2 border-b border-zinc-900 flex items-center justify-between flex-none">
        <div className="flex items-center gap-2">
          {tag && (
            <span
              className={`text-[9px] font-data tracking-[0.22em] uppercase px-1.5 py-0.5 rounded-sm border ${
                accent === "teal"
                  ? "bg-teal-400/[0.06] border-teal-400/30 text-teal-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400"
              }`}
            >
              {tag}
            </span>
          )}
          <h3 className="text-[12px] font-semibold tracking-[0.16em] uppercase text-zinc-200">
            {title}
          </h3>
        </div>
        {sub && (
          <span className="text-[9px] font-data uppercase tracking-[0.18em] text-zinc-500">
            {sub}
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </section>
  );
}
