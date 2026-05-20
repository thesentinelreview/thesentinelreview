import Link from "next/link";
import type { Alert } from "@/data/placeholder";

// DB event_type → display label/colors. clash→Contact, movement→Track.
const KIND: Record<Alert["event_type"], { label: string; dot: string; pill: string }> = {
  strike: { label: "Strike", dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]", pill: "border-red-500/30 bg-red-500/[0.08] text-red-400" },
  clash: { label: "Contact", dot: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]", pill: "border-amber-500/30 bg-amber-500/[0.08] text-amber-400" },
  movement: { label: "Track", dot: "bg-teal-300 shadow-[0_0_6px_rgba(34,211,238,0.7)]", pill: "border-teal-400/30 bg-teal-400/[0.08] text-teal-300" },
};

const CONF: Record<Alert["confidence"], { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "text-emerald-400" },
  partial: { label: "Partial", cls: "text-amber-400" },
  unconfirmed: { label: "Unconfirmed", cls: "text-zinc-500" },
};

function fmtTime(m: number): string {
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export default function AlertRow({ alert, theaterId }: { alert: Alert; theaterId: string }) {
  const kind = KIND[alert.event_type];
  const conf = CONF[alert.confidence];
  return (
    <Link
      href={`/event/${alert.id}?theater=${theaterId}`}
      className="block px-3 py-2.5 border-b border-zinc-900 hover:bg-zinc-900/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-none ${kind.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-zinc-100 truncate">{alert.title}</span>
            <span className="text-[10px] font-data text-zinc-500 flex-none">{fmtTime(alert.minutes_ago)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[9px] font-data uppercase tracking-[0.2em]">
            <span className={`px-1.5 py-px rounded-sm border ${kind.pill}`}>{kind.label}</span>
            <span className="text-zinc-500">{alert.source_count} src</span>
            <span className={conf.cls}>{conf.label}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
