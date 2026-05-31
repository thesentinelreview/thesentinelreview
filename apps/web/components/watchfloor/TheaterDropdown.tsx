"use client";

import Link from "next/link";
import { useRef } from "react";

export interface DropdownOption {
  label: string;
  href: string;
  active: boolean;
}

export default function TheaterDropdown({
  current,
  options,
}: {
  current: string;
  options: DropdownOption[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");

  return (
    <details ref={ref} className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary className="list-none cursor-pointer bg-navy-mid border border-gold/25 rounded-sm px-2 py-1 text-cream select-none hover:border-gold/45 text-[10px] font-data tracking-[0.18em] uppercase">
        {current} ▾
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[150px] bg-navy-mid border border-gold/25 rounded-sm py-1 shadow-xl">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            onClick={close}
            className={`block px-3 py-1.5 text-[11px] tracking-[0.08em] ${
              o.active
                ? "text-gold-pale bg-gold/[0.08]"
                : "text-gray-light hover:bg-navy-light/60"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
