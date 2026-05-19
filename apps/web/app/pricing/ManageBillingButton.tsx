"use client";

import { useState } from "react";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export default function ManageBillingButton({ className, children }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "Redirecting…" : (children ?? "Manage billing →")}
    </button>
  );
}
