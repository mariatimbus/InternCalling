/** Plain-text job descriptions as headings, paragraphs and bullet lists. */
export type DescriptionBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

const BULLET = /^\s*(?:[•●▪◦‣*·–-]|\d{1,2}[.)])\s+/;

/** "ABOUT THE ROLE" -> "About the role"; mixed-case headings stay as written. */
function heading(line: string) {
  const text = line.replace(/:\s*$/, "").trim();
  return /\p{Ll}/u.test(text) ? text : text.charAt(0) + text.slice(1).toLowerCase();
}

function isHeading(line: string, next: string | undefined) {
  if (line.length > 70 || /[.!?,;]$/.test(line) || /https?:\/\//.test(line)) return false;
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (line.endsWith(":") && line.split(/\s+/).length <= 8) return true;
  if (letters.length >= 4 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) return true;
  return Boolean(next && BULLET.test(next)) && line.split(/\s+/).length <= 8;
}

export function structureDescription(text: string): DescriptionBlock[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  const first = blocks.find((block) => block.kind === "paragraph" && !/^(?:Official source|Source last checked):/i.test(block.text))
    ?? blocks.find((block) => block.kind === "list");
  return !first ? "" : first.kind === "list" ? first.items.join(" · ") : first.text;
}
