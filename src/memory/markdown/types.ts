// TERAGON AI BUSINESS OS — Obsidian-compatible markdown types (Wave 6, W6-B).
// The RICH block model used by the W6-B renderer / import preview / export.
// The legacy 4-kind MarkdownBlock contract in src/modules/memory/markdown.ts
// stays stable — it is produced by DOWN-MAPPING these rich blocks (lossy but
// safe). Nothing in this module ever emits HTML strings: blocks are data,
// rendered exclusively through React elements (no dangerouslySetInnerHTML).

/** Inline content — every variant is plain data, rendered as React text. */
export type ObsidianInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "code"; value: string }
  /** #tag occurrence (without the leading #) */
  | { kind: "tag"; value: string }
  /** [[Target]] / [[Target|Display]] / [[Target#Section]] / [[Target#^block]] */
  | {
      kind: "wikilink";
      target: string;
      display: string;
      section: string | null;
      blockRef: string | null;
    }
  /**
   * [label](href). external ⇒ renderer adds rel="noopener noreferrer" + an
   * explicit external marker. neutralized ⇒ href was javascript:/data:/other
   * dangerous scheme — rendered as inert text, never as an anchor.
   */
  | { kind: "link"; href: string; label: string; external: boolean; neutralized: boolean }
  /**
   * ![alt](src) — NEVER fetched/rendered as <img> (blocks tracking pixels).
   * Rendered as a text placeholder that names the reference.
   */
  | { kind: "image-placeholder"; alt: string; src: string }
  /** raw HTML encountered in the source — preserved as LITERAL text only */
  | { kind: "escaped-html"; value: string };

export interface ObsidianListItem {
  inline: ObsidianInline[];
  /** null = plain list item; true/false = checklist state */
  checked: boolean | null;
}

/** Block-level content of the safe Obsidian subset. */
export type ObsidianBlock =
  | { kind: "heading"; level: number; inline: ObsidianInline[] }
  | { kind: "paragraph"; inline: ObsidianInline[] }
  | { kind: "list"; ordered: boolean; items: ObsidianListItem[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "blockquote"; lines: ObsidianInline[][] }
  | { kind: "table"; header: ObsidianInline[][]; rows: ObsidianInline[][][] }
  | { kind: "divider" };

/** One wikilink occurrence parsed out of the body. */
export interface ParsedWikiLink {
  /** the full raw text inside [[...]] */
  raw: string;
  /** link target (page title), trimmed, without section/block suffixes */
  target: string;
  /** display text (alias when given, else target) */
  display: string;
  /** #Section suffix (without #) or null */
  section: string | null;
  /** #^block suffix (without #^) or null */
  blockRef: string | null;
}

/** Result of parsing one markdown body through the safe parser. */
export interface ParsedMarkdown {
  blocks: ObsidianBlock[];
  /** true when ANY raw HTML / dangerous URL was neutralized */
  sanitized: boolean;
  /** honest Hebrew reasons for each sanitization action */
  sanitizedReasons: string[];
  /** #tags found inline (de-duped, order preserved, without #) */
  tags: string[];
  /** wikilinks found (all occurrences, order preserved) */
  wikilinks: ParsedWikiLink[];
}
