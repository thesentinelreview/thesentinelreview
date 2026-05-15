import TopBar from "@/components/TopBar";
import { SeverityBadge } from "@/components/SeverityBadge";
import { getThreatMetrics, searchIOCs, getRecentCVEs } from "@/lib/queries";

export const revalidate = 60;

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const tab = sp.tab ?? "ioc";
  const metrics = await getThreatMetrics();

  const [iocs, cves] = await Promise.all([
    searchIOCs(q || "", 100),
    getRecentCVEs(50),
  ]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar metrics={metrics} />

      {/* Tab bar + search */}
      <div
        className="flex items-center gap-4 px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}
      >
        <a href="/intelligence?tab=ioc"
          className="font-mono text-[9px] tracking-widest px-3 py-1 border transition-colors"
          style={{
            color: tab !== "cve" ? "var(--color-neon-cyan)" : "var(--color-ink-muted)",
            borderColor: tab !== "cve" ? "var(--color-neon-cyan)40" : "var(--color-edge)",
          }}>
          IOC LIBRARY
        </a>
        <a href="/intelligence?tab=cve"
          className="font-mono text-[9px] tracking-widest px-3 py-1 border transition-colors"
          style={{
            color: tab === "cve" ? "var(--color-neon-cyan)" : "var(--color-ink-muted)",
            borderColor: tab === "cve" ? "var(--color-neon-cyan)40" : "var(--color-edge)",
          }}>
          CVE TRACKER
        </a>
        <div className="flex-1" />
        {tab !== "cve" && (
          <form>
            <input type="hidden" name="tab" value="ioc" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search IOCs — hash, IP, domain, URL..."
              className="font-mono text-[10px] px-3 py-1 bg-transparent border w-72 focus:outline-none"
              style={{
                borderColor: "var(--color-edge-strong)",
                color: "var(--color-ink)",
              }}
            />
          </form>
        )}
        <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
          {tab === "cve" ? `${cves.length} CVEs` : `${metrics.iocs_total.toLocaleString()} IOCs TOTAL`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "cve" ? (
          <CVETable cves={cves} />
        ) : (
          <IOCTable iocs={iocs} query={q} />
        )}
      </div>
    </div>
  );
}

function IOCTable({ iocs, query: q }: { iocs: any[]; query: string }) {
  const TYPE_COLORS: Record<string, string> = {
    ip:           "var(--color-neon-red)",
    domain:       "var(--color-neon-amber)",
    url:          "var(--color-neon-amber)",
    hash_sha256:  "var(--color-neon-purple)",
    hash_md5:     "var(--color-neon-purple)",
    hash_sha1:    "var(--color-neon-purple)",
    email:        "var(--color-neon-cyan)",
  };

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b sticky top-0" style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}>
          {["TYPE", "VALUE", "THREAT", "FAMILY", "CONFIDENCE", "SEVERITY", "LAST SEEN"].map((h) => (
            <th key={h} className="text-left px-3 py-2 font-mono text-[8px] tracking-widest"
              style={{ color: "var(--color-ink-muted)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {iocs.map((ioc: any) => (
          <tr key={ioc.id} className="border-b hover:brightness-110"
            style={{ borderColor: "var(--color-edge)" }}>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[8px] tracking-wider px-1.5 py-0.5"
                style={{ color: TYPE_COLORS[ioc.ioc_type] ?? "var(--color-ink-muted)", background: `${TYPE_COLORS[ioc.ioc_type] ?? "transparent"}15` }}>
                {ioc.ioc_type.toUpperCase()}
              </span>
            </td>
            <td className="px-3 py-1.5 max-w-xs">
              <span className="font-mono text-[9px] truncate block" style={{ color: "var(--color-ink)" }}>
                {ioc.value}
              </span>
            </td>
            <td className="px-3 py-1.5">
              <span className="font-sans text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                {ioc.threat_type ?? "—"}
              </span>
            </td>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-neon-purple)" }}>
                {ioc.malware_family ?? "—"}
              </span>
            </td>
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-1 rounded-full" style={{ width: 40, background: "var(--color-edge)" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${ioc.confidence}%`,
                    background: ioc.confidence >= 75 ? "var(--color-neon-red)" : "var(--color-neon-amber)",
                  }} />
                </div>
                <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-muted)" }}>
                  {ioc.confidence}%
                </span>
              </div>
            </td>
            <td className="px-3 py-1.5"><SeverityBadge severity={ioc.severity} size="xs" /></td>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                {new Date(ioc.last_seen).toISOString().slice(0, 10)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CVETable({ cves }: { cves: any[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b sticky top-0" style={{ borderColor: "var(--color-edge)", background: "var(--color-surface-2)" }}>
          {["CVE ID", "SEVERITY", "CVSS", "DESCRIPTION", "EXPLOIT", "KEV", "PUBLISHED"].map((h) => (
            <th key={h} className="text-left px-3 py-2 font-mono text-[8px] tracking-widest"
              style={{ color: "var(--color-ink-muted)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cves.map((cve: any) => (
          <tr key={cve.id} className="border-b hover:brightness-110"
            style={{ borderColor: "var(--color-edge)", background: cve.kev_listed ? "var(--color-neon-red-dim)" : "transparent" }}>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[10px]" style={{ color: "var(--color-neon-cyan)" }}>
                {cve.cve_id}
              </span>
            </td>
            <td className="px-3 py-1.5">
              {cve.severity && <SeverityBadge severity={cve.severity as any} size="xs" />}
            </td>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[10px]"
                style={{ color: (cve.cvss_v3_score ?? 0) >= 9 ? "var(--color-neon-red)" : "var(--color-ink)" }}>
                {cve.cvss_v3_score ?? "—"}
              </span>
            </td>
            <td className="px-3 py-1.5 max-w-sm">
              <span className="font-sans text-[9px] line-clamp-1" style={{ color: "var(--color-ink-muted)" }}>
                {cve.description}
              </span>
            </td>
            <td className="px-3 py-1.5 text-center">
              {cve.has_exploit && (
                <span className="font-mono text-[8px]" style={{ color: "var(--color-neon-red)" }}>YES</span>
              )}
            </td>
            <td className="px-3 py-1.5 text-center">
              {cve.kev_listed && (
                <span className="font-mono text-[8px] font-bold" style={{ color: "var(--color-neon-red)" }}>KEV</span>
              )}
            </td>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-ink-faint)" }}>
                {new Date(cve.published_at).toISOString().slice(0, 10)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
