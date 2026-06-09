import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageShellProps {
  children:   ReactNode;
  /** Render as a different element (e.g. "main", "section"). Default "div". */
  as?:        ElementType;
  className?: string;
}

/**
 * PageShell — the canonical full-bleed page column.
 *
 * Full width (no max-width / mx-auto) with the standard page gutter
 * (`px-(--gutter)`, see @theme in globals.css) and vertical rhythm. The single
 * source of truth for the content-page shell so routes share identical
 * left/right edges. Presentational only: props in, no data fetching.
 */
export default function PageShell({ children, as, className }: PageShellProps) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "w-full px-(--gutter) py-6 pb-20 flex flex-col gap-4",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
