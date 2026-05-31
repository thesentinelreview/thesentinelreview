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
  accent?: "gold";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col bg-navy-mid/40 border border-gold/20 rounded-sm overflow-hidden min-h-0 ${className}`}
    >
      <header className="px-3 py-2 border-b border-gold/15 flex items-center justify-between flex-none">
        <div className="flex items-center gap-2">
          {tag && (
            <span
              className={`text-[9px] font-data tracking-[0.22em] uppercase px-1.5 py-0.5 rounded-sm border ${
                accent === "gold"
                  ? "bg-gold/[0.08] border-gold/40 text-gold-pale"
                  : "bg-navy-mid border-gold/25 text-gold-pale"
              }`}
            >
              {tag}
            </span>
          )}
          <h3 className="text-[12px] font-data font-semibold tracking-[0.22em] uppercase text-cream">
            {title}
          </h3>
        </div>
        {sub && (
          <span className="text-[9px] font-data uppercase tracking-[0.18em] text-gold-pale/70">
            {sub}
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </section>
  );
}
