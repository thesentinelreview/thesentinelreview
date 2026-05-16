"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Props {
  initialValue?: string;
  theater: string;
  timeRange?: string;
  types?: string;
  confidence?: string;
  className?: string;
}

export default function SearchBox({ initialValue, theater, timeRange, types, confidence, className }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(q: string) {
    const p = new URLSearchParams();
    p.set("theater", theater);
    if (timeRange) p.set("window", timeRange);
    if (types) p.set("types", types);
    if (confidence) p.set("confidence", confidence);
    if (q.trim()) p.set("q", q.trim());
    router.push(`/?${p}`);
  }

  function handleChange(e: { target: HTMLInputElement }) {
    const val = e.target.value;
    setValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(val), 400);
  }

  return (
    <input
      type="search"
      value={value}
      onChange={handleChange}
      placeholder="Search events…"
      className={className}
    />
  );
}
