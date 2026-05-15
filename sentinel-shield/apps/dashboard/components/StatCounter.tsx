"use client";

import { useEffect, useRef, useState } from "react";

interface StatCounterProps {
  label: string;
  value: number;
  color?: string;
  unit?: string;
  sublabel?: string;
}

export default function StatCounter({ label, value, color, unit, sublabel }: StatCounterProps) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef<number>(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (animRef.current) cancelAnimationFrame(animRef.current);
    const duration = 800;
    const start = performance.now();

    function step(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) animRef.current = requestAnimationFrame(step);
    }
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [value]);

  const c = color ?? "var(--color-neon-cyan)";

  return (
    <div
      className="flex flex-col justify-between p-3 border"
      style={{
        borderColor: "var(--color-edge)",
        background: "var(--color-surface)",
        minWidth: 120,
      }}
    >
      <span
        className="font-mono text-[9px] tracking-widest uppercase"
        style={{ color: "var(--color-ink-muted)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-3xl font-semibold leading-none mt-1"
        style={{ color: c, textShadow: `0 0 12px ${c}60` }}
      >
        {displayed.toLocaleString()}
        {unit && <span className="text-base ml-1" style={{ color: "var(--color-ink-muted)" }}>{unit}</span>}
      </span>
      {sublabel && (
        <span className="font-mono text-[9px] mt-1" style={{ color: "var(--color-ink-faint)" }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}
