import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind class names with conflict resolution.
 *
 * clsx flattens conditional / array / object inputs; tailwind-merge then makes
 * the last conflicting utility win, so a `className` prop can override a base
 * class (e.g. `cn("p-6", "p-4")` → "p-4"). This is the only class-merge helper
 * in the app — the design-system primitives all route through it.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
