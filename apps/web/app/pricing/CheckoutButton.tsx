"use client";

import { useState } from "react";

interface Props {
  priceId: string;
  className?: string;
  children: React.ReactNode;
}

export default function CheckoutButton({ priceId, className, children }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

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
      setError(data.error ?? "Could not start checkout. Try again in a moment.");
      setLoading(false);
    } catch {
      setError("Network error — try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Redirecting…" : children}
      </button>
      {/* W2-5: agreement notice adjacent to every buy button. v1 is notice-only;
          a clickwrap checkbox is flagged as an attorney question in the PR. */}
      <p style={{ marginTop: 8, fontSize: 12, color: "#9aa3b2", lineHeight: 1.4 }}>
        By subscribing you agree to the{" "}
        <a href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>
          Terms of Service
        </a>
        .
      </p>
      {error && (
        <div role="alert" style={{ marginTop: 8, color: "#d05050", fontSize: 13 }}>
          {error}
        </div>
      )}
    </>
  );
}
