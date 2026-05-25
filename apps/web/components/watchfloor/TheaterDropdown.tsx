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
      <summary className="list-none cursor-pointer bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1 text-zinc-300 select-none hover:border-zinc-700 text-[10px] font-data tracking-[0.18em] uppercase">
        {current} ▾
      </summary>
      <div className="absolute right-0 mt-1 z-50 min-w-[150px] bg-zinc-900 border border-zinc-800 rounded-sm py-1 shadow-xl">
        {options.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            onClick={close}
            className={`block px-3 py-1.5 text-[11px] tracking-[0.08em] ${
              o.active
                ? "text-teal-300 bg-teal-400/[0.06]"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
