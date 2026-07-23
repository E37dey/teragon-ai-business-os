// W6-B — the markdown seam, now backed by the FULL safe Obsidian engine
// (src/memory/markdown/). The MarkdownBlock/InlineSegment CONTRACT of W6-A is
// UNCHANGED — NoteView and the page tests keep working untouched. Rich blocks
// (code fences, tables, blockquotes, checklists, emphasis, safe links) are
// DOWN-MAPPED to the stable 4-kind union; output remains plain strings that
// React renders as text nodes (no dangerouslySetInnerHTML anywhere — raw HTML
// arrives here already reduced to literal text by the safe parser).
import { parseInlineText, parseObsidianMarkdown } from "@/memory/markdown/parser";
import type { ObsidianBlock, ObsidianInline } from "@/memory/markdown/types";

export interface InlineSegment {
  kind: "text" | "wikilink";
  value: string;
}

export type MarkdownBlock =
  | { kind: "heading"; level: number; segments: InlineSegment[] }
  | { kind: "list"; items: InlineSegment[][] }
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "divider" };

function downmapInline(inline: readonly ObsidianInline[]): InlineSegment[] {
  const out: InlineSegment[] = [];
  const pushText = (value: string): void => {
    if (value === "") return;
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.value += value;
    else out.push({ kind: "text", value });
  };
  for (const s of inline) {
    switch (s.kind) {
      case "wikilink":
        out.push({ kind: "wikilink", value: s.display });
        break;
      case "link":
        pushText(s.neutralized ? `${s.label} (קישור נוטרל)` : s.label);
        break;
      case "image-placeholder":
        pushText(`[תמונה: ${s.alt || s.src || "ללא תיאור"} — לא נטענה]`);
        break;
      case "tag":
        pushText(`#${s.value}`);
        break;
      default:
        // text / strong / em / code / escaped-html — literal text
        pushText(s.value);
    }
  }
  return out;
}

function joinCells(row: readonly (readonly ObsidianInline[])[]): InlineSegment[] {
  const out: InlineSegment[] = [];
  row.forEach((cell, i) => {
    if (i > 0) out.push({ kind: "text", value: " · " });
    out.push(...downmapInline(cell));
  });
  return out;
}

function downmapBlock(block: ObsidianBlock): MarkdownBlock[] {
  switch (block.kind) {
    case "heading":
      return [{ kind: "heading", level: block.level, segments: downmapInline(block.inline) }];
    case "divider":
      return [{ kind: "divider" }];
    case "list":
      return [
        {
          kind: "list",
          items: block.items.map((item) => {
            const segments = downmapInline(item.inline);
            if (item.checked !== null) {
              segments.unshift({ kind: "text", value: item.checked ? "☑ " : "☐ " });
            }
            return segments;
          }),
        },
      ];
    case "code":
      return [{ kind: "paragraph", segments: [{ kind: "text", value: block.code }] }];
    case "blockquote":
      return block.lines.map((line) => ({
        kind: "paragraph" as const,
        segments: downmapInline(line),
      }));
    case "table":
      return [{ kind: "list", items: [joinCells(block.header), ...block.rows.map(joinCells)] }];
    default:
      return [{ kind: "paragraph", segments: downmapInline(block.inline) }];
  }
}

/** split a line into text / [[wikilink]] segments (pure; no HTML). */
export function splitInline(text: string): InlineSegment[] {
  return downmapInline(parseInlineText(text));
}

/** parse markdown to safe blocks: headings, lists, paragraphs, dividers. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  return parseObsidianMarkdown(markdown).blocks.flatMap(downmapBlock);
}
