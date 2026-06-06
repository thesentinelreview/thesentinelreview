import { cn } from "@/lib/cn";
import { PARTNER_BADGE, platformStyle, tierStyle } from "./tokens";

// Canonical base — see DESIGN.md. inline-flex/items-center keep text (and any
// future icon) centred; everything else is the directive's exact base.
const BADGE_BASE =
  "inline-flex items-center px-1.5 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider";

export type BadgeVariant = "platform" | "tier" | "partner";

export interface BadgeProps {
  variant:    BadgeVariant;
  /** platform: enum string · tier: 1|2|3 · partner: the label to show. */
  value:      string | number;
  className?: string;
}

/**
 * Badge — small categorical label. Colours resolve from tokens.ts by variant.
 * No value renders unstyled: unknown platforms fall back to neutral slate.
 */
export default function Badge({ variant, value, className }: BadgeProps) {
  let label: string;
  let color: string;

  if (variant === "platform") {
    const s = platformStyle(String(value));
    label = s.label;
    color = s.className;
  } else if (variant === "tier") {
    const s = tierStyle(Number(value));
    label = s.label;
    color = s.className;
  } else {
    label = String(value);
    color = PARTNER_BADGE;
  }

  return <span className={cn(BADGE_BASE, color, className)}>{label}</span>;
}
