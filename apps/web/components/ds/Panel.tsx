import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PANEL_BASE, PANEL_HOVER } from "./tokens";

const PADDING = {
  sm: "p-5",
  md: "p-6",
} as const;

export interface PanelProps {
  children:   ReactNode;
  /** Adds the interactive border treatment on hover. */
  hover?:     boolean;
  /** Interior spacing. Omit for a flush panel the caller pads itself. */
  padding?:   keyof typeof PADDING;
  /** Render as a different element (e.g. "article", "section"). Default "div". */
  as?:        ElementType;
  className?: string;
}

/**
 * Panel — the canonical panel chrome (gradient slate surface, border, shadow).
 * Presentational only: props in, no data fetching.
 */
export default function Panel({
  children,
  hover = false,
  padding,
  as,
  className,
}: PanelProps) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        PANEL_BASE,
        hover && PANEL_HOVER,
        padding && PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
