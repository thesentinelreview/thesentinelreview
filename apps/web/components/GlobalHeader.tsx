"use client";

import { usePathname } from "next/navigation";
import SiteHeader from "./SiteHeader";
import type { Tier } from "@/lib/entitlements-core";

// Chrome is split by page type. Operational views render their own integrated
// chrome — "/" (the watchfloor command bar), /app/* (the feed header), and
// /embed/* (bare iframe widgets) — so the global SiteHeader is mounted on the
// content / marketing routes only.
export default function GlobalHeader({
  isAuthed = false,
  tier,
  showAdmin = false,
}: {
  isAuthed?: boolean;
  tier?: Tier;
  showAdmin?: boolean;
}) {
  const pathname = usePathname() || "/";
  const isOperational =
    pathname === "/" || pathname.startsWith("/app/") || pathname.startsWith("/embed/");
  if (isOperational) return null;

  // The header mounts inside the padded <body>; the wrapper breaks it out to the
  // viewport edges so it's flush on the not-yet-reskinned content pages. Flush
  // shells (watchfloor) reset the margin in globals.css.
  return (
    <div className="global-site-header">
      <SiteHeader isAuthed={isAuthed} tier={tier} showAdmin={showAdmin} />
    </div>
  );
}
