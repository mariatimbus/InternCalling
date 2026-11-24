/** Plain-text job descriptions as headings, paragraphs and bullet lists. */
export type DescriptionBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const BULLET = /^\s*(?:[•●▪◦‣*·–-]|\d{1,2}[.)])\s+/;
const SECTION_LABELS: [RegExp, string][] = [
  [/^(?:mission brief|your mission|the role|about the (?:role|position))$/i, "About the role"],
  [/^(?:(?:your |the )?(?:responsibilities|tasks|duties)|what you(?:['’]ll| will) do)$/i, "Responsibilities"],
  [/^(?:(?:your )?(?:profile|qualifications)|requirements|what you (?:bring|offer)|what we(?:['’]re| are) looking for)$/i, "Qualifications"],
  [/^(?:benefits|perks|what we offer|our offer|why join us)$/i, "Benefits"],
];
const SECTION = /^(?:about (?:us|the (?:team|company))|(?:minimum |preferred )?(?:requirements|qualifications)|required|preferred)$/i;

function sectionLabel(text: string) {
  return SECTION_LABELS.find(([pattern]) => pattern.test(text.replace(/:\s*$/, "")))?.[1];
}

/** "ABOUT THE ROLE" -> "About the role"; mixed-case headings stay as written. */
function heading(line: string) {
  const text = line.replace(/:\s*$/, "").trim();
  const label = sectionLabel(text);
  if (label) return label;
  return /\p{Ll}/u.test(text) ? text : text.charAt(0) + text.slice(1).toLowerCase();
}

function isHeading(line: string, next: string | undefined) {
  if (line.length > 70 || /[.!?,;]$/.test(line) || /https?:\/\//.test(line)) return false;
  if (sectionLabel(line) || SECTION.test(line.replace(/:\s*$/, ""))) return true;
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (line.endsWith(":") && line.split(/\s+/).length <= 8) return true;
  if (letters.length >= 4 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) return true;
  return Boolean(next && BULLET.test(next)) && line.split(/\s+/).length <= 8;
}

export function structureDescription(text: string): DescriptionBlock[] {
  const lines = text.replace(/(^|\s)\\?#li-[a-z0-9_-]+\b/gi, "$1")
    .replace(/(^|\n)[ \t]*([•●▪◦‣*·–-]|\d{1,2}[.)])[ \t]*\r?\n(?:[ \t]*\r?\n)*[ \t]*(?=\S)/g, "$1$2 ")
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const blocks: DescriptionBlock[] = [];
  lines.forEach((line, index) => {
    const last = blocks.at(-1);
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (isHeading(line, lines[index + 1])) {
      blocks.push({ kind: "heading", text: heading(line) });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  });
  // A heading with nothing under it (the last line, or two headings in a row) is just text.
  return blocks.map((block, index) => block.kind === "heading" && (index === blocks.length - 1 || blocks[index + 1].kind === "heading")
    ? { kind: "paragraph", text: block.text } : block);
}

/** A card preview: the first real paragraph, never a heading like "ABOUT THE ROLE". */
export function descriptionSnippet(text: string | null | undefined): string {
  const blocks = structureDescription(text ?? "");
  const paragraphs = blocks.filter((block): block is Extract<DescriptionBlock, { kind: "paragraph" }> => block.kind === "paragraph" && !/^(?:(?:Official source|Source last checked):|[A-Z]{1,4}-\d+\b)/i.test(block.text));
  const first = paragraphs.find((block) => /[.!?](?:\s|$)/.test(block.text)) ?? paragraphs.at(0)
    ?? blocks.find((block) => block.kind === "list");
  return !first ? "" : first.kind === "list" ? first.items.join(" · ") : first.text;
}
