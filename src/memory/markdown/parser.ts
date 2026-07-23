// TERAGON AI BUSINESS OS — safe Obsidian-subset markdown parser
// (Wave 6, W6-B, Phase 6.4).
//
// Supported subset: headings, paragraphs, ordered/unordered lists, checklists,
// emphasis (**bold** / *italic* / `code`), fenced code blocks, internal +
// external links, tables, blockquotes, #tags, [[wikilinks]] (+aliases),
// YAML frontmatter (frontmatter.ts).
//
// Security invariants (tested):
// - output is DATA ONLY — rendered through React text nodes; there is no
//   HTML string assembly and no dangerouslySetInnerHTML anywhere
// - raw HTML in the source is preserved as LITERAL text (escaped-html inline)
//   and flips `sanitized: true` with an honest reason
// - javascript:/data:/vbscript:/file:/unknown-scheme URLs are neutralized
//   (rendered inert, never as an anchor). ALL data: URLs are neutralized.
// - images (![alt](src)) are NEVER fetched — external tracking pixels render
//   as a text placeholder that names the reference
import { parseWikiLinkText } from "./wikilinks";
import type { ObsidianBlock, ObsidianInline, ObsidianListItem, ParsedMarkdown, ParsedWikiLink } from "./types";

// ---------------------------------------------------------------------------
// URL policy
// ---------------------------------------------------------------------------

export interface UrlClassification {
  href: string;
  external: boolean;
  neutralized: boolean;
  reasonHe: string | null;
}

const SAFE_EXTERNAL_SCHEMES = new Set(["http", "https", "mailto"]);

/** classify a link target under the safe-URL policy. */
export function classifyUrl(rawHref: string): UrlClassification {
  const href = rawHref.trim();
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/u.exec(href);
  if (!schemeMatch) {
    // relative / vault-internal reference — kept as inert text (no navigation)
    return { href, external: false, neutralized: false, reasonHe: null };
  }
  const scheme = (schemeMatch[1] ?? "").toLowerCase();
  if (SAFE_EXTERNAL_SCHEMES.has(scheme)) {
    return { href, external: true, neutralized: false, reasonHe: null };
  }
  return {
    href: "",
    external: false,
    neutralized: true,
    reasonHe: `קישור עם scheme מסוכן (${scheme}:) נוטרל`,
  };
}

// ---------------------------------------------------------------------------
// inline parsing
// ---------------------------------------------------------------------------

interface ParseContext {
  sanitized: boolean;
  reasons: string[];
  tags: string[];
  wikilinks: ParsedWikiLink[];
}

const INLINE_RE = new RegExp(
  [
    "(`[^`]+`)", // 1 inline code
    "(!\\[[^\\]]*\\]\\([^)]*\\))", // 2 image
    "(\\[\\[[^\\]]+\\]\\])", // 3 wikilink
    "(\\[[^\\]]+\\]\\([^)]*\\))", // 4 md link
    "(\\*\\*[^*]+\\*\\*)", // 5 strong
    "(\\*[^*\\s][^*]*\\*)", // 6 em
    "(</?[a-zA-Z!][^>]*>)", // 7 raw html tag
    "(#[\\p{L}\\p{N}_/-]+)", // 8 tag
  ].join("|"),
  "gu",
);

function pushTag(ctx: ParseContext, tag: string): void {
  if (!ctx.tags.includes(tag)) ctx.tags.push(tag);
}

/** parse one line of text into safe inline segments. */
export function parseInline(text: string, ctx: ParseContext): ObsidianInline[] {
  const out: ObsidianInline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    const token = m[0];
    // #tag only counts when at start / after whitespace (not part of a word/URL)
    if (m[8] !== undefined) {
      const before = m.index === 0 ? " " : text[m.index - 1] ?? " ";
      if (!/\s|\(/u.test(before)) continue;
    }
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    last = m.index + token.length;

    if (m[1] !== undefined) {
      out.push({ kind: "code", value: token.slice(1, -1) });
    } else if (m[2] !== undefined) {
      const im = /^!\[([^\]]*)\]\(([^)]*)\)$/u.exec(token);
      const alt = im?.[1] ?? "";
      const src = (im?.[2] ?? "").trim();
      // NEVER fetched — placeholder only (tracking pixels stay blind)
      out.push({ kind: "image-placeholder", alt, src });
      ctx.sanitized = true;
      ctx.reasons.push(`תמונה «${alt || src}» לא נטענת — מוצגת כהפניה בלבד (הגנת מעקב)`);
    } else if (m[3] !== undefined) {
      const inner = token.slice(2, -2).trim();
      const wl = parseWikiLinkText(inner);
      ctx.wikilinks.push(wl);
      out.push({
        kind: "wikilink",
        target: wl.target,
        display: wl.display,
        section: wl.section,
        blockRef: wl.blockRef,
      });
    } else if (m[4] !== undefined) {
      const lm = /^\[([^\]]+)\]\(([^)]*)\)$/u.exec(token);
      const label = lm?.[1] ?? token;
      const cls = classifyUrl(lm?.[2] ?? "");
      if (cls.neutralized) {
        ctx.sanitized = true;
        if (cls.reasonHe) ctx.reasons.push(cls.reasonHe);
      }
      out.push({ kind: "link", href: cls.href, label, external: cls.external, neutralized: cls.neutralized });
    } else if (m[5] !== undefined) {
      out.push({ kind: "strong", value: token.slice(2, -2) });
    } else if (m[6] !== undefined) {
      out.push({ kind: "em", value: token.slice(1, -1) });
    } else if (m[7] !== undefined) {
      // raw HTML — preserved as LITERAL text, flagged
      out.push({ kind: "escaped-html", value: token });
      ctx.sanitized = true;
      ctx.reasons.push("תגית HTML גולמית הוצגה כטקסט בלבד (לא פורשה)");
    } else if (m[8] !== undefined) {
      const tag = token.slice(1);
      pushTag(ctx, tag);
      out.push({ kind: "tag", value: tag });
    }
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** parse a single line of inline text with a throwaway context. */
export function parseInlineText(text: string): ObsidianInline[] {
  const ctx: ParseContext = { sanitized: false, reasons: [], tags: [], wikilinks: [] };
  return parseInline(text, ctx);
}

// ---------------------------------------------------------------------------
// block parsing
// ---------------------------------------------------------------------------

const FENCE_RE = /^(```|~~~)\s*([\w+-]*)\s*$/u;
const HEADING_RE = /^(#{1,6})\s+(.*)$/u;
const DIVIDER_RE = /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/u;
const UL_RE = /^\s*[-*+]\s+(.*)$/u;
const OL_RE = /^\s*\d{1,9}[.)]\s+(.*)$/u;
const CHECK_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/u;
const QUOTE_RE = /^\s*>\s?(.*)$/u;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|\s*$|^\s*\|[\s:|-]+\|?\s*$/u;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/**
 * Parse a markdown BODY (frontmatter already split off) into safe blocks.
 * Pure: same input ⇒ same output.
 */
export function parseObsidianMarkdown(body: string): ParsedMarkdown {
  const ctx: ParseContext = { sanitized: false, reasons: [], tags: [], wikilinks: [] };
  const blocks: ObsidianBlock[] = [];
  const lines = body.split("\n");

  let list: { ordered: boolean; items: ObsidianListItem[] } | null = null;
  let quote: ObsidianInline[][] | null = null;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join(" "), ctx) });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flushQuote = (): void => {
    if (quote) {
      blocks.push({ kind: "blockquote", lines: quote });
      quote = null;
    }
  };
  const flushAll = (): void => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trimEnd();

    // fenced code
    const fence = FENCE_RE.exec(line.trim());
    if (fence) {
      flushAll();
      const marker = fence[1] ?? "```";
      const language = fence[2] ?? "";
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith(marker)) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      blocks.push({ kind: "code", language, code: codeLines.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        inline: parseInline(heading[2] ?? "", ctx),
      });
      i += 1;
      continue;
    }

    if (DIVIDER_RE.test(line)) {
      flushAll();
      blocks.push({ kind: "divider" });
      i += 1;
      continue;
    }

    const quoteLine = QUOTE_RE.exec(line);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote = quote ?? [];
      quote.push(parseInline(quoteLine[1] ?? "", ctx));
      i += 1;
      continue;
    }
    flushQuote();

    // table: header row + separator row
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1] ?? "")) {
      flushAll();
      const header = splitTableRow(line).map((c) => parseInline(c, ctx));
      i += 2;
      const rows: ObsidianInline[][][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(splitTableRow(lines[i] ?? "").map((c) => parseInline(c, ctx)));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const check = CHECK_RE.exec(line);
    if (check) {
      flushParagraph();
      flushQuote();
      if (list?.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push({
        inline: parseInline(check[2] ?? "", ctx),
        checked: (check[1] ?? " ").toLowerCase() === "x",
      });
      i += 1;
      continue;
    }
    const ul = UL_RE.exec(line);
    if (ul) {
      flushParagraph();
      flushQuote();
      if (list?.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push({ inline: parseInline(ul[1] ?? "", ctx), checked: null });
      i += 1;
      continue;
    }
    const ol = OL_RE.exec(line);
    if (ol) {
      flushParagraph();
      flushQuote();
      if (list && !list.ordered) flushList();
      list = list ?? { ordered: true, items: [] };
      list.items.push({ inline: parseInline(ol[1] ?? "", ctx), checked: null });
      i += 1;
      continue;
    }
    flushList();

    paragraph.push(line.trim());
    i += 1;
  }
  flushAll();

  return {
    blocks,
    sanitized: ctx.sanitized,
    sanitizedReasons: ctx.reasons,
    tags: ctx.tags,
    wikilinks: ctx.wikilinks,
  };
}
