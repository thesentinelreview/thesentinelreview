"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./SiteNav.module.css";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/theaters", label: "Theaters" },
  { href: "/app/feed", label: "Source feed" },
  { href: "/sources", label: "Sources" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
];

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className={s.nav}>
      <Link href="/" className={s.brand}>
        <span className={s.brandLogo} />
        <span className={s.brandName}>Sentinel Review</span>
      </Link>
      <div className={s.links}>
        {NAV.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${s.link} ${isActive ? s.linkActive : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
