"use client";

import { useState } from "react";

interface Props {
  priceId: string;
  label: string;
  isSignedIn: boolean;
  primary?: boolean;
}

export default function CheckoutButton({ priceId, label, isSignedIn, primary }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!isSignedIn) {
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      if (res.status === 401) {
        window.location.href = `/sign-up?redirect_url=${encodeURIComponent("/pricing")}`;
        return;
      }

      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error ?? "No checkout URL");
      window.location.href = data.url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        width: "100%",
        padding: "10px 16px",
        background: primary ? "var(--green)" : "var(--surface-2)",
        border: `1px solid ${primary ? "var(--green)" : "var(--border-strong)"}`,
        borderRadius: 4,
        color: primary ? "#0c0d10" : "var(--text)",
        fontFamily: "var(--font-mono-stack)",
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {loading ? "Loading…" : label}
    </button>
  );
}
