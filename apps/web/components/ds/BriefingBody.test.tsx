import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseBriefingSections } from "@/lib/briefing-format";
import BriefingBody from "./BriefingBody";

const BLUF_TEXT = [
  "## BLUF",
  "",
  "Strike tempo in Donetsk is roughly double the 7-day baseline.",
  "",
  "## WHAT CHANGED",
  "",
  "Donetsk logged 12 events against a 5.2/day baseline.",
  "",
  "## WHY IT MATTERS",
  "",
  "Sustained pressure on the Pokrovsk axis narrows the remaining supply corridors.",
  "",
  "## OUTLOOK (24–72H)",
  "",
  "Watch for renewed shelling near Pokrovsk.",
  "",
  "⚠ AI-generated analysis. Events sourced from open-source reporting; " +
    "locations and details unverified. Not for operational use.",
].join("\n");

describe("BriefingBody renderer", () => {
  it("BLUF markdown renders four styled section labels with their bodies", () => {
    const sections = parseBriefingSections(BLUF_TEXT);
    const html = renderToStaticMarkup(
      <BriefingBody sections={sections} paragraphs={[]} />,
    );

    // Four DS section labels, in order, no raw markdown heading markers.
    expect(html.match(/<h2/g)).toHaveLength(4);
    const labelClass = "text-xs font-data tracking-[0.12em] uppercase text-slate-400";
    for (const heading of ["BLUF", "WHAT CHANGED", "WHY IT MATTERS", "OUTLOOK (24–72H)"]) {
      expect(html).toContain(`<h2 class="${labelClass}">${heading}</h2>`);
    }
    expect(html.indexOf("BLUF")).toBeLessThan(html.indexOf("WHAT CHANGED"));
    expect(html.indexOf("WHAT CHANGED")).toBeLessThan(html.indexOf("WHY IT MATTERS"));
    expect(html.indexOf("WHY IT MATTERS")).toBeLessThan(html.indexOf("OUTLOOK (24–72H)"));
    expect(html).not.toContain("##");

    // Bodies render under their labels.
    expect(html).toContain("<p>Strike tempo in Donetsk is roughly double the 7-day baseline.</p>");
    expect(html).toContain("<p>Watch for renewed shelling near Pokrovsk.</p>");
  });

  it("legacy text renders exactly as today — plain paragraph flow, no labels", () => {
    const html = renderToStaticMarkup(
      <BriefingBody sections={null} paragraphs={["Para one.", "Para two."]} />,
    );
    // Byte-identical to the markup /briefing/[id] produced before W2-3.
    expect(html).toBe(
      '<div class="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">' +
        "<p>Para one.</p><p>Para two.</p></div>",
    );
  });
});
