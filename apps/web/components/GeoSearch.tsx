"use client";

import { useRef, useState } from "react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  resultClassName?: string;
  loadingClassName?: string;
}

export default function GeoSearch({
  className,
  inputClassName,
  dropdownClassName,
  resultClassName,
  loadingClassName,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleChange(e: { target: HTMLInputElement }) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5`,
          { headers: { "Accept-Language": "en" } },
        );
        setResults(await res.json() as NominatimResult[]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function handleSelect(r: NominatimResult) {
    setQuery("");
    setResults([]);
    window.dispatchEvent(
      new CustomEvent("sentinel:flyto", {
        detail: { lng: parseFloat(r.lon), lat: parseFloat(r.lat), zoom: 10 },
      }),
    );
  }

  function handleBlur(e: { relatedTarget: EventTarget | null }) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setTimeout(() => setResults([]), 150);
    }
  }

  const showDropdown = loading || results.length > 0;

  return (
    <div ref={containerRef} className={className} onBlur={handleBlur} style={{ position: "relative" }}>
      <input
        type="search"
        value={query}
        onChange={handleChange}
        placeholder="Search location…"
        className={inputClassName}
        autoComplete="off"
      />
      {showDropdown && (
        <div className={dropdownClassName}>
          {loading && <div className={loadingClassName}>Searching…</div>}
          {results.map((r) => (
            <div
              key={r.place_id}
              className={resultClassName}
              onMouseDown={() => handleSelect(r)}
            >
              {r.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
