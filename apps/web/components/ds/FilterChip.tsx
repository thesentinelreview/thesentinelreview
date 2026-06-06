import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const CHIP_BASE =
  "px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all";
const CHIP_ACTIVE = "bg-slate-700 border-slate-500 text-slate-100";
const CHIP_INACTIVE =
  "bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600";

export interface FilterChipProps {
  active?:    boolean;
  children:   ReactNode;
  /** Client-side toggle. Use when filter state lives in the client. */
  onClick?:   () => void;
  /** URL-driven filter: renders a Next <Link> (the feed's server model). */
  href?:      string;
  className?: string;
}

/**
 * FilterChip — toggle pill for filter rows. Presentational; the parent owns
 * filter state. Pass `href` for URL-driven filters (server-rendered) or
 * `onClick` for client-side toggles.
 */
export default function FilterChip({
  active = false,
  children,
  onClick,
  href,
  className,
}: FilterChipProps) {
  const classes = cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_INACTIVE, className);

  if (href) {
    // Links don't take aria-pressed; active state is conveyed visually.
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} aria-pressed={active}>
      {children}
    </button>
  );
}
