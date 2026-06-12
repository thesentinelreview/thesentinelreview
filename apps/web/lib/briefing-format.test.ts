import { describe, expect, it } from "vitest";
import {
  blufPreviewParagraphs,
  briefingListTitle,
  briefingPreviewParagraphs,
  isBlufBriefing,
  parseBriefingSections,
  splitParagraphs,
} from "./briefing-format";

// W2-3 BLUF briefing as generate_briefing_draft now produces it: four fixed
// "## " headings, then the standing disclaimer as its own paragraph.
const BLUF_BODY =
  "Strike tempo in Donetsk is roughly double the 7-day baseline. Pokrovsk absorbs most of it.";

const DISCLAIMER =
  "⚠ AI-generated analysis. Events sourced from open-source reporting; " +
  "locations and details unverified. Not for operational use.";

const BLUF_TEXT = [
  "## BLUF",
  "",
  BLUF_BODY,
  "",
  "## WHAT CHANGED",
  "",
  "Donetsk logged 12 events against a 5.2/day baseline; two clusters are corroborated.",
  "",
  "## WHY IT MATTERS",
  "",
  "Sustained pressure on the Pokrovsk axis narrows the remaining supply corridors.",
  "",
  "## OUTLOOK (24–72H)",
  "",
  "Watch for renewed shelling near Pokrovsk; sustained drone activity would indicate follow-on strikes.",
  "",
  DISCLAIMER,
].join("\n");

// Legacy paragraph-prose briefing exactly as the 152 published rows store it.
const LEGACY_TEXT = [
  "Overnight activity concentrated in Donetsk oblast. Twelve events were logged across the period.",
  "",
  "Two strike clusters near Pokrovsk are corroborated by independent sources.",
  "",
  DISCLAIMER,
].join("\n");

describe("isBlufBriefing detection", () => {
  it("detects the ## BLUF heading", () => {
    expect(isBlufBriefing(BLUF_TEXT)).toBe(true);
  });

  it("legacy prose is not BLUF", () => {
    expect(isBlufBriefing(LEGACY_TEXT)).toBe(false);
  });

  it("null/empty are not BLUF", () => {
    expect(isBlufBriefing(null)).toBe(false);
    expect(isBlufBriefing("")).toBe(false);
  });

  it("a paragraph merely mentioning BLUF is not BLUF", () => {
    expect(isBlufBriefing("The briefing mentions ## BLUF mid-sentence.")).toBe(false);
  });
});

describe("parseBriefingSections", () => {
  it("BLUF text parses into the four sections in order", () => {
    const sections = parseBriefingSections(BLUF_TEXT)!;
    expect(sections.map((s) => s.heading)).toEqual([
      "BLUF",
      "WHAT CHANGED",
      "WHY IT MATTERS",
      "OUTLOOK (24–72H)",
    ]);
  });

  it("section bodies carry their paragraphs; disclaimer stays in OUTLOOK", () => {
    const sections = parseBriefingSections(BLUF_TEXT)!;
    expect(sections[0].paragraphs).toEqual([BLUF_BODY]);
    const outlook = sections[3];
    expect(outlook.paragraphs).toHaveLength(2);
    expect(outlook.paragraphs[1]).toBe(DISCLAIMER);
  });

  it("tolerates a missing blank line after a heading", () => {
    const sections = parseBriefingSections("## BLUF\nBody right after the heading.")!;
    expect(sections).toEqual([{ heading: "BLUF", paragraphs: ["Body right after the heading."] }]);
  });

  it("legacy text returns null (renderer keeps today's path)", () => {
    expect(parseBriefingSections(LEGACY_TEXT)).toBeNull();
    expect(parseBriefingSections(null)).toBeNull();
  });
});

describe("preview logic (today card / history list)", () => {
  it("BLUF briefing previews as the BLUF body, headings stripped", () => {
    expect(blufPreviewParagraphs(BLUF_TEXT)).toEqual([BLUF_BODY]);
    const preview = briefingPreviewParagraphs(BLUF_TEXT);
    expect(preview).toEqual([BLUF_BODY]);
    expect(preview.join(" ")).not.toContain("##");
  });

  it("legacy briefing keeps the unchanged first-two-paragraphs preview", () => {
    expect(blufPreviewParagraphs(LEGACY_TEXT)).toBeNull();
    expect(briefingPreviewParagraphs(LEGACY_TEXT)).toEqual(
      splitParagraphs(LEGACY_TEXT).slice(0, 2),
    );
    expect(briefingPreviewParagraphs(LEGACY_TEXT)).toEqual([
      "Overnight activity concentrated in Donetsk oblast. Twelve events were logged across the period.",
      "Two strike clusters near Pokrovsk are corroborated by independent sources.",
    ]);
  });
});

describe("briefingListTitle (API v1 list preview)", () => {
  it("legacy rows keep the SQL first-sentence rule: split_part(text, '.', 1) capped at 120", () => {
    expect(briefingListTitle(LEGACY_TEXT)).toBe(
      "Overnight activity concentrated in Donetsk oblast",
    );
    const long = `${"x".repeat(200)}. tail`;
    expect(briefingListTitle(long)).toBe("x".repeat(120));
    expect(briefingListTitle("no period at all")).toBe("no period at all");
  });

  it("BLUF rows title from the BLUF body, never the markdown heading", () => {
    const title = briefingListTitle(BLUF_TEXT);
    expect(title).toBe("Strike tempo in Donetsk is roughly double the 7-day baseline");
    expect(title).not.toContain("#");
  });
});
