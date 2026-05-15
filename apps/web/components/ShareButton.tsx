"use client";

import { useState } from "react";

export default function ShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button onClick={handleClick} className={className}>
      {copied ? "COPIED ✓" : "SHARE ↗"}
    </button>
  );
}
