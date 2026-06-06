"use client";

import { usePathname } from "next/navigation";
import SiteHeader from "./SiteHeader";

// Mounts the global SiteHeader on every route except the standalone /embed/*
// widgets, which are designed to render bare inside iframes (no app chrome).
export default function GlobalHeader({ isAuthed = false }: { isAuthed?: boolean }) {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/embed")) return null;
  return <SiteHeader isAuthed={isAuthed} />;
}
