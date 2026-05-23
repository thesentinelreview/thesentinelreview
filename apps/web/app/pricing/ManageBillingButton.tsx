"use client";

import { useState } from "react";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function ManageBillingButton({ className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });

      if (res.status === 401) {
        const here = typeof window !== "undefined" ? window.location.pathname : "/pricing";
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(here)}`;
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Could not open the billing portal. Try again in a moment.");
      setLoading(false);
    } catch {
      setError("Network error — try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Redirecting…" : (children ?? "Manage billing →")}
      </button>
      {error && (
        <div role="alert" style={{ marginTop: 8, color: "#d05050", fontSize: 13 }}>
          {error}
        </div>
      )}
    </>
  );
}
