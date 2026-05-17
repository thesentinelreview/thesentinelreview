"use client";

import { useEffect, useState } from "react";

export default function SuccessBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      onClick={() => setVisible(false)}
      style={{
        background: "rgba(82, 183, 136, 0.12)",
        border: "1px solid var(--green)",
        borderRadius: 4,
        padding: "10px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        fontFamily: "var(--font-mono-stack)",
        fontSize: 12,
        color: "var(--green)",
        letterSpacing: "0.04em",
      }}
    >
      <span>Subscription active. Welcome to Analyst access.</span>
      <span style={{ opacity: 0.6, fontSize: 16, lineHeight: 1 }}>×</span>
    </div>
  );
}
