import Link from "next/link";
import Panel from "./Panel";

/**
 * UpgradePrompt — honest gated state for records behind the tier time floor.
 * Renders no record data (titles, dates, text all withheld) and links to
 * /pricing. Used by event/briefing detail pages and list upgrade rows.
 */
export default function UpgradePrompt({
  kind,
  compact = false,
}: {
  /** What is being gated — drives the copy only. */
  kind: "event" | "briefing" | "feed";
  /** Compact row variant for list/feed contexts. */
  compact?: boolean;
}) {
  const copy =
    kind === "briefing"
      ? {
          heading: "Briefing archive is an Analyst feature",
          body: "Watch tier includes the last 24 hours of briefings. Analyst unlocks the full briefing archive.",
        }
      : kind === "feed"
        ? {
            heading: "End of the Watch window",
            body: "Watch tier includes the last 7 days of source posts. Analyst unlocks the full archive.",
          }
        : {
            heading: "Event archive is an Analyst feature",
            body: "Watch tier includes the last 7 days of events. Analyst unlocks the full queryable archive.",
          };

  return (
    <Panel padding={compact ? "sm" : "md"} className="text-center">
      <div className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">
        Analyst Tier
      </div>
      <h2 className={`${compact ? "text-base" : "text-xl"} font-bold text-white mt-2`}>
        {copy.heading}
      </h2>
      <p className="text-sm text-slate-400 mt-2 max-w-prose mx-auto">{copy.body}</p>
      <div className="mt-4">
        <Link
          href="/pricing"
          className="inline-block px-4 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm font-semibold uppercase tracking-wider hover:bg-amber-500/20"
        >
          See Analyst pricing →
        </Link>
      </div>
    </Panel>
  );
}
