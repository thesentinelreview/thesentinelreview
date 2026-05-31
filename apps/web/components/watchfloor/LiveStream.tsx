import Pane from "./Pane";
import AlertRow from "./AlertRow";
import type { Alert } from "@/lib/types";

export default function LiveStream({
  alerts,
  theaterId,
  className = "",
}: {
  alerts: Alert[];
  theaterId: string;
  className?: string;
}) {
  return (
    <Pane tag="03" title="Live Event Stream" sub={<span className="text-red-alert tracking-[0.18em]">● LIVE</span>} className={className}>
      {alerts.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] font-data uppercase tracking-[0.08em] text-gray-mid/60">
          No active alerts
        </div>
      ) : (
        alerts.map((a) => <AlertRow key={a.id} alert={a} theaterId={theaterId} />)
      )}
    </Pane>
  );
}
