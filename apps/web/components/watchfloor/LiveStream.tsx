import Link from "next/link";
import { AlertCircle, Target, Swords, TrendingUp, ShieldCheck, ShieldAlert, AlertTriangle, Clock } from "lucide-react";
import type { MapEvent } from "@/lib/types";

// "Active Alerts" pane — shows the 3 most recent events as detail cards.
// Fed by getMapEvents (which carries description, location_name, oblast) so the
// cards show useful text. Each card links to the event detail page.
const eventTypeIcons = {
  strike: Target,
  clash: Swords,
  movement: TrendingUp,
};

const eventTypeColors = {
  strike: "text-red-400 bg-red-500/10 border-red-500/20",
  clash: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  movement: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const confidenceBadges = {
  verified: { icon: ShieldCheck, color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  partial: { icon: ShieldAlert, color: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  unconfirmed: { icon: AlertTriangle, color: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function LiveStream({
  events,
  theaterId,
}: {
  events: MapEvent[];
  theaterId: string;
}) {
  const top = events.slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-700 rounded-xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <div className="p-1.5 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          Active Alerts
        </h2>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs text-red-400 font-semibold">Live</span>
        </div>
      </div>

      {top.length === 0 ? (
        <div className="text-xs text-slate-500 uppercase tracking-wider py-6 text-center">
          No active alerts
        </div>
      ) : (
        <div className="space-y-3">
          {top.map((event, index) => {
            const EventIcon = eventTypeIcons[event.event_type];
            const badge = confidenceBadges[event.confidence];
            const BadgeIcon = badge.icon;

            return (
              <Link
                key={event.id}
                href={`/event/${event.id}?theater=${theaterId}`}
                className="relative group block bg-slate-800/40 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600 hover:bg-slate-800/60 transition-all cursor-pointer"
              >
                {index === 0 && (
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider shadow-lg">
                    New
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-1.5 rounded-lg border flex-none ${eventTypeColors[event.event_type]}`}>
                      <EventIcon className={`w-3.5 h-3.5 ${eventTypeColors[event.event_type].split(" ")[0]}`} />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-100 capitalize text-sm">{event.event_type}</span>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <span className="text-xs text-slate-400 truncate">{event.location_name}</span>
                        {event.oblast && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-xs text-slate-500 truncate">{event.oblast}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-900/50 px-2 py-1 rounded flex-none">
                    <Clock className="w-3 h-3" />
                    {formatTime(event.occurred_at)}
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed mb-3 pl-9 line-clamp-3">
                  {event.description}
                </p>

                <div className="flex items-center justify-between pl-9">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${badge.color}`}>
                    <BadgeIcon className="w-3 h-3" />
                    {event.confidence.toUpperCase()}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {event.source_count} source{event.source_count === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
