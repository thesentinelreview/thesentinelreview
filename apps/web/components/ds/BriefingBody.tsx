import type { BriefingSection } from "@/lib/briefing-format";

// Briefing body for the full-briefing surface. BLUF briefings (sections set)
// render the four headings as DS section labels above their bodies; legacy
// briefings (sections null) keep today's plain paragraph flow byte-for-byte —
// the 152 published rows are a record, not a draft (W2-3).
export default function BriefingBody({
  sections,
  paragraphs,
}: {
  sections: BriefingSection[] | null;
  paragraphs: string[];
}) {
  if (!sections) {
    return (
      <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-2">
          {s.heading && (
            <h2 className="text-xs font-data tracking-[0.12em] uppercase text-slate-400">
              {s.heading}
            </h2>
          )}
          <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
            {s.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
