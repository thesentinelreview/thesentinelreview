// W2-3 BLUF theater briefings — format detection, parsing, and previews.
//
// Newly generated briefings are plain markdown with four fixed "## " section
// headings (BLUF / WHAT CHANGED / WHY IT MATTERS / OUTLOOK (24–72H)) stored in
// the same draft_text/published_text columns as the legacy paragraph-prose
// rows. The schema carries no format marker — detection is the presence of a
// "## BLUF" heading line. Pure module (no db/env imports) so it stays
// unit-testable; queries.ts routes briefing text through these helpers.

export interface BriefingSection {
  /** Heading text without the leading "## " — empty for pre-heading content. */
  heading: string;
  paragraphs: string[];
}

const HEADING_RE = /^##\s+(.+?)\s*$/;
const BLUF_RE = /^##\s+BLUF\b/m;

/** Split briefing text into trimmed, non-empty paragraphs on blank lines. */
export function splitParagraphs(text: string | null): string[] {
  if (!text) return [];
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** W2-3 detection rule: a briefing is BLUF-format iff it has a "## BLUF" heading line. */
export function isBlufBriefing(text: string | null): boolean {
  return text != null && BLUF_RE.test(text);
}

/**
 * Parse a BLUF briefing into ordered sections (heading + body paragraphs).
 * Returns null for legacy (non-BLUF) text so callers fall back to today's
 * plain-paragraph rendering — mixed history is expected and correct.
 */
export function parseBriefingSections(text: string | null): BriefingSection[] | null {
  if (text == null || !isBlufBriefing(text)) return null;

  const sections: BriefingSection[] = [];
  let heading = "";
  let body: string[] = [];

  const flush = () => {
    const paragraphs = splitParagraphs(body.join("\n"));
    if (heading || paragraphs.length > 0) sections.push({ heading, paragraphs });
  };

  for (const line of text.split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      heading = m[1];
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * BLUF section body for preview surfaces, headings stripped. Null for legacy
 * briefings — callers keep their current preview behavior.
 */
export function blufPreviewParagraphs(text: string | null): string[] | null {
  const sections = parseBriefingSections(text);
  if (!sections) return null;
  const bluf = sections.find((s) => /^BLUF\b/.test(s.heading.trim()));
  return bluf ? bluf.paragraphs : null;
}

/**
 * Preview paragraphs for list/card surfaces (today card, history list):
 * the BLUF body when present, otherwise the legacy first-two-paragraphs rule.
 */
export function briefingPreviewParagraphs(text: string | null): string[] {
  return blufPreviewParagraphs(text) ?? splitParagraphs(text).slice(0, 2);
}

/**
 * One-line title for the API v1 briefings list: first sentence of the preview
 * text, capped at 120 chars. Legacy rows keep the original SQL rule
 * (left(split_part(text, '.', 1), 120)); BLUF rows apply the same rule to the
 * BLUF body so titles never lead with a markdown heading.
 */
export function briefingListTitle(text: string): string {
  const bluf = blufPreviewParagraphs(text);
  const source = bluf ? bluf.join(" ") : text;
  return source.split(".", 1)[0].slice(0, 120);
}
