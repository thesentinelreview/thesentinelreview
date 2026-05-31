import Link from "next/link";
import type { Alert } from "@/lib/types";

// DB event_type → display label/colors. clash→Contact. Colors match the
// map pins / legend (strike red-alert, contact orange, movement signal cyan).
const KIND: Record<Alert["event_type"], { label: string; dot: string; pill: string }> = {
  strike: { label: "Strike", dot: "bg-red-alert shadow-[0_0_6px_rgba(192,57,43,0.7)]", pill: "border-red-alert/40 bg-red-alert/10 text-red-alert" },
  clash: { label: "Contact", dot: "bg-contact shadow-[0_0_6px_rgba(230,81,0,0.6)]", pill: "border-contact/40 bg-contact/10 text-contact" },
  movement: { label: "Movement", dot: "bg-signal-cyan shadow-[0_0_6px_rgba(79,179,191,0.55)]", pill: "border-signal-cyan/40 bg-signal-cyan/10 text-signal-cyan" },
};

const CONF: Record<Alert["confidence"], { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "text-[color:var(--color-low)]" },
  partial: { label: "Partial", cls: "text-gold" },
  unconfirmed: { label: "Unconfirmed", cls: "text-gray-mid" },
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
      className="block px-3 py-2.5 border-b border-gold/15 hover:bg-navy-mid/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-none ${kind.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold text-cream truncate">{alert.title}</span>
            <span className="text-[10px] font-data tabular-nums text-gold-pale/70 flex-none">{fmtTime(alert.minutes_ago)}</span>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap text-[9px] font-data uppercase tracking-[0.2em]">
            <span className={`px-1.5 py-px rounded-sm border ${kind.pill}`}>{kind.label}</span>
            <span className="text-gray-mid">{alert.source_count} src</span>
            <span className={conf.cls}>{conf.label}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
