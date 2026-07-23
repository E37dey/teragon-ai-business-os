// W6-A — minimal-SAFE markdown parsing for the /memory note view.
// SEAM NOTE (W6-B): this is deliberately a tiny, escape-everything renderer —
// output is plain strings rendered as React text nodes (React escapes them;
// no dangerouslySetInnerHTML anywhere). W6-B's full sanitizer/markdown engine
// replaces this seam without touching callers: same MarkdownBlock contract.

export interface InlineSegment {
  kind: "text" | "wikilink";
  value: string;
}

export type MarkdownBlock =
  | { kind: "heading"; level: number; segments: InlineSegment[] }
  | { kind: "list"; items: InlineSegment[][] }
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "divider" };

/** split a line into text / [[wikilink]] segments (pure; no HTML). */
export function splitInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: "text", value: text.slice(last, m.index) });
    const alias = m[2]?.trim();
    segments.push({ kind: "wikilink", value: alias || (m[1] ?? "").trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments;
}

/** parse markdown to safe blocks: headings, lists, paragraphs, dividers. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let listItems: InlineSegment[][] = [];
  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) {
      flushList();
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        segments: splitInline(heading[2] ?? ""),
      });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/u.test(line.trim())) {
      flushList();
      blocks.push({ kind: "divider" });
      continue;
    }
    const listItem = /^\s*[-*+]\s+(.*)$/u.exec(line);
    if (listItem) {
      listItems.push(splitInline(listItem[1] ?? ""));
      continue;
    }
    flushList();
    if (line.trim().length > 0) {
      blocks.push({ kind: "paragraph", segments: splitInline(line) });
    }
  }
  flushList();
  return blocks;
}
