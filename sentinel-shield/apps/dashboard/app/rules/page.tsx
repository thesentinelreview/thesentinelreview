"use client";

import { useState, useEffect, useCallback } from "react";
import TopBar from "@/components/TopBar";

interface YaraRule {
  id: string;
  rule_name: string;
  category: string | null;
  severity: string | null;
  source: string;
  enabled: boolean;
  created_at: string;
  content_length?: number;
  rule_content?: string;
}

const CATEGORIES = ["malware", "network", "file", "process"] as const;
const SEVERITIES = ["critical", "high", "medium", "low"] as const;

const SEV_COLORS: Record<string, string> = {
  critical: "var(--color-neon-red)",
  high:     "var(--color-neon-amber)",
  medium:   "var(--color-neon-cyan)",
  low:      "var(--color-ink-muted)",
};

const BLANK_FORM = { name: "", category: "malware" as string, severity: "medium" as string, rule_content: "", enabled: true };

export default function RulesPage() {
  const [rules, setRules] = useState<YaraRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rules?limit=100");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setRules(data.rules);
      setTotal(data.total);
    } catch {
      setError("Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  async function handleToggle(rule: YaraRule) {
    await fetch(`/api/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this YARA rule?")) return;
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => t - 1);
    }
  }

  async function handleEdit(rule: YaraRule) {
    const res = await fetch(`/api/rules/${rule.id}`);
    const data = await res.json();
    setForm({
      name: data.rule.rule_name,
      category: data.rule.category ?? "malware",
      severity: data.rule.severity ?? "medium",
      rule_content: data.rule.rule_content,
      enabled: data.rule.enabled,
    });
    setEditId(rule.id);
    setShowForm(true);
    setFormError(null);
  }

  function handleNew() {
    setForm({ ...BLANK_FORM });
    setEditId(null);
    setShowForm(true);
    setFormError(null);
  }

  function handleCancel() {
    setShowForm(false);
    setEditId(null);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.rule_content.trim()) {
      setFormError("Name and rule content are required");
      return;
    }
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        severity: form.severity,
        rule_content: form.rule_content,
        enabled: form.enabled,
      };

      const res = editId
        ? await fetch(`/api/rules/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? "Save failed");
        return;
      }

      setShowForm(false);
      setEditId(null);
      await fetchRules();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <TopBar />

      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
          YARA RULES // {total} TOTAL
        </span>
        <button
          onClick={handleNew}
          className="font-mono text-[9px] tracking-widest px-3 py-1 border transition-colors"
          style={{ color: "var(--color-neon-green)", borderColor: "var(--color-neon-green)40" }}
        >
          + ADD RULE
        </button>
      </div>

      {showForm && (
        <div
          className="shrink-0 border-b px-4 py-4"
          style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-3)" }}
        >
          <div className="font-mono text-[9px] tracking-widest mb-3" style={{ color: "var(--color-neon-cyan)" }}>
            {editId ? "EDIT RULE" : "NEW RULE"}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 140px 140px auto" }}>
              <div>
                <label className="block font-mono text-[8px] mb-1" style={{ color: "var(--color-ink-muted)" }}>NAME</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full font-mono text-[10px] px-2 py-1 bg-transparent border focus:outline-none"
                  style={{ borderColor: "var(--color-edge-strong)", color: "var(--color-ink)" }}
                  placeholder="rule_name"
                />
              </div>

              <div>
                <label className="block font-mono text-[8px] mb-1" style={{ color: "var(--color-ink-muted)" }}>CATEGORY</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full font-mono text-[10px] px-2 py-1 border focus:outline-none"
                  style={{ borderColor: "var(--color-edge-strong)", background: "var(--color-surface)", color: "var(--color-ink)" }}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[8px] mb-1" style={{ color: "var(--color-ink-muted)" }}>SEVERITY</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                  className="w-full font-mono text-[10px] px-2 py-1 border focus:outline-none"
                  style={{ borderColor: "var(--color-edge-strong)", background: "var(--color-surface)", color: SEV_COLORS[form.severity] ?? "var(--color-ink)" }}
                >
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="w-3 h-3 accent-green-500"
                  />
                  <span className="font-mono text-[8px]" style={{ color: "var(--color-ink-muted)" }}>ENABLED</span>
                </label>
              </div>
            </div>

            <div className="mt-3">
              <label className="block font-mono text-[8px] mb-1" style={{ color: "var(--color-ink-muted)" }}>RULE CONTENT</label>
              <textarea
                value={form.rule_content}
                onChange={(e) => setForm((f) => ({ ...f, rule_content: e.target.value }))}
                rows={8}
                className="w-full font-mono text-[10px] px-2 py-1.5 bg-transparent border focus:outline-none resize-y"
                style={{
                  borderColor: "var(--color-edge-strong)",
                  color: "var(--color-neon-green)",
                  background: "var(--color-surface)",
                  fontFamily: "var(--font-mono)",
                }}
                placeholder={`rule ExampleRule {\n    meta:\n        description = "Example rule"\n    strings:\n        $a = "malicious_string"\n    condition:\n        $a\n}`}
              />
            </div>

            {formError && (
              <div className="mt-2 font-mono text-[9px]" style={{ color: "var(--color-neon-red)" }}>
                {formError}
              </div>
            )}

            <div className="flex items-center gap-3 mt-3">
              <button
                type="submit"
                disabled={submitting}
                className="font-mono text-[9px] tracking-widest px-4 py-1.5 border transition-colors"
                style={{ color: "var(--color-neon-cyan)", borderColor: "var(--color-neon-cyan)40" }}
              >
                {submitting ? "SAVING..." : (editId ? "UPDATE" : "CREATE")}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="font-mono text-[9px] tracking-widest px-3 py-1.5 border transition-colors"
                style={{ color: "var(--color-ink-muted)", borderColor: "var(--color-edge)" }}
              >
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-4 font-mono text-xs text-center" style={{ color: "var(--color-ink-muted)" }}>
            LOADING RULES...
          </div>
        )}
        {error && (
          <div className="p-4 font-mono text-xs text-center" style={{ color: "var(--color-neon-red)" }}>
            {error}
          </div>
        )}
        {!loading && rules.length === 0 && !error && (
          <div className="p-4 font-mono text-xs text-center" style={{ color: "var(--color-ink-faint)" }}>
            NO RULES CONFIGURED
          </div>
        )}
        {rules.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr
                className="border-b sticky top-0"
                style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
              >
                {["NAME", "CATEGORY", "SEVERITY", "SOURCE", "ENABLED", "CREATED", "ACTIONS"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 font-mono text-[8px] tracking-widest"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b hover:brightness-110 transition-colors"
                  style={{ borderColor: "var(--color-edge)" }}
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px]" style={{ color: "var(--color-ink)" }}>
                      {rule.rule_name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="font-mono text-[8px] tracking-wider px-1.5 py-0.5"
                      style={{ color: "var(--color-neon-purple)", background: "var(--color-neon-purple)15" }}
                    >
                      {rule.category?.toUpperCase() ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {rule.severity ? (
                      <span
                        className="font-mono text-[9px] tracking-wider"
                        style={{ color: SEV_COLORS[rule.severity] ?? "var(--color-ink-muted)" }}
                      >
                        {rule.severity.toUpperCase()}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-ink-faint)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                      {rule.source}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggle(rule)}
                      className="flex items-center gap-1.5 cursor-pointer"
                      title={rule.enabled ? "Click to disable" : "Click to enable"}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${rule.enabled ? "animate-pulse-green" : ""}`}
                        style={{ background: rule.enabled ? "var(--color-neon-green)" : "var(--color-ink-faint)" }}
                      />
                      <span
                        className="font-mono text-[9px]"
                        style={{ color: rule.enabled ? "var(--color-neon-green)" : "var(--color-ink-faint)" }}
                      >
                        {rule.enabled ? "ON" : "OFF"}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                      {new Date(rule.created_at).toISOString().slice(0, 10)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(rule)}
                        className="font-mono text-[8px] tracking-wider px-2 py-0.5 border transition-colors"
                        style={{ color: "var(--color-neon-cyan)", borderColor: "var(--color-neon-cyan)30" }}
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="font-mono text-[8px] tracking-wider px-2 py-0.5 border transition-colors"
                        style={{ color: "var(--color-neon-red)", borderColor: "var(--color-neon-red)30" }}
                      >
                        DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
