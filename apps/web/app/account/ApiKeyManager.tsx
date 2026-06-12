"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const BTN =
  "px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider hover:bg-amber-500/20 disabled:opacity-50";

export default function ApiKeyManager({ keys }: { keys: ApiKeyListItem[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function createKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { key?: string; error?: string };
      if (!res.ok || !data.key) {
        setError(data.error ?? "Could not create the key.");
      } else {
        setCreatedKey(data.key);
        setName("");
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/account/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {createdKey && (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3 flex flex-col gap-1">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Copy this key now — it is shown exactly once
          </div>
          <code className="font-mono text-sm text-slate-100 break-all select-all">{createdKey}</code>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="key name (e.g. my-monitor)"
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
        />
        <button onClick={createKey} disabled={busy} className={BTN}>
          {busy ? "…" : "Create key"}
        </button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}

      {keys.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-slate-800/60">
                <td className="py-2 pr-3 text-slate-200">{k.name}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-400">{k.key_prefix}…</td>
                <td className="py-2 pr-3 text-xs text-slate-500">
                  created {k.created_at.slice(0, 10)}
                  {k.last_used_at ? ` · last used ${k.last_used_at.slice(0, 10)}` : " · never used"}
                </td>
                <td className="py-2 text-right">
                  {k.revoked_at ? (
                    <span className="text-xs text-slate-500">revoked</span>
                  ) : (
                    <button
                      onClick={() => revoke(k.id)}
                      disabled={busy}
                      className="px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] font-semibold uppercase tracking-wider hover:bg-red-500/20"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
