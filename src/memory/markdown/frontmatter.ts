// TERAGON AI BUSINESS OS — safe YAML frontmatter for memory records
// (Wave 6, W6-B, Phase 6.4).
//
// A HAND-ROLLED safe YAML subset — deliberately NOT a full YAML parser:
// - top-level `key: value` scalars, inline `[a, b]` lists, block `- item` lists
// - NO anchors/aliases/merge-keys (`&x`, `*x`, `<<:`) — the recursive-alias
//   bomb class is rejected outright (typed error, tested)
// - NO nested maps for supported fields; unknown nested content is preserved
//   as raw text inside `extensions`
//
// Contract:
// - exactly 14 supported fields; anything else goes to `extensions` and can
//   NEVER control behavior (the import pipeline only reads `fields`)
// - a denylist validator rejects keys that try to define permissions, system
//   prompts, approval bypasses, credentials, tool access, org identity or
//   executable code — fail closed with a Hebrew error
// - frontmatter over 16KB is rejected before parsing

export const FRONTMATTER_MAX_BYTES = 16 * 1024;

/**
 * the 14 supported frontmatter fields (Obsidian-compatible). The wave brief
 * named 13; `folder` completes the 14 — it maps to the existing layer-folder
 * browser and carries no capability (documented in OBSIDIAN_COMPATIBILITY.md).
 */
export const SUPPORTED_FRONTMATTER_FIELDS = [
  "id",
  "title",
  "aliases",
  "tags",
  "memory_layer",
  "folder",
  "owner",
  "sensitivity",
  "status",
  "created",
  "updated",
  "review_date",
  "linked_entities",
  "sources",
] as const;

export type SupportedFrontmatterField = (typeof SUPPORTED_FRONTMATTER_FIELDS)[number];

const LIST_FIELDS: ReadonlySet<string> = new Set(["aliases", "tags", "linked_entities", "sources"]);

export interface MemoryFrontmatterFields {
  id?: string;
  title?: string;
  aliases?: string[];
  tags?: string[];
  memory_layer?: string;
  folder?: string;
  owner?: string;
  sensitivity?: string;
  status?: string;
  created?: string;
  updated?: string;
  review_date?: string;
  linked_entities?: string[];
  sources?: string[];
}

export interface ParsedFrontmatter {
  /** the 14 supported fields only — the ONLY thing behavior may read */
  fields: MemoryFrontmatterFields;
  /** unknown keys preserved verbatim — metadata only, NEVER control behavior */
  extensions: Record<string, string | string[]>;
  /** the raw YAML text (for the secured import record) */
  raw: string;
}

export interface FrontmatterSplit {
  frontmatterRaw: string | null;
  body: string;
}

// ---------------------------------------------------------------------------
// typed errors (Hebrew, fail closed)
// ---------------------------------------------------------------------------

export type FrontmatterErrorCode =
  | "FRONTMATTER_TOO_LARGE"
  | "FRONTMATTER_DENYLIST"
  | "FRONTMATTER_YAML_ALIAS"
  | "FRONTMATTER_INVALID";

export const FRONTMATTER_ERROR_HE: Record<FrontmatterErrorCode, string> = {
  FRONTMATTER_TOO_LARGE: `ה-frontmatter חורג מהמגבלה (${FRONTMATTER_MAX_BYTES / 1024}KB) — הקובץ נדחה`,
  FRONTMATTER_DENYLIST:
    "ה-frontmatter מנסה להגדיר שדה אסור (הרשאות / הנחיות מערכת / עקיפת אישור / סודות / גישה לכלים / זהות ארגון / קוד) — הקובץ נדחה",
  FRONTMATTER_YAML_ALIAS:
    "עוגני/כינויי YAML (&, *, <<:) אינם נתמכים — הגנה מפני פצצת הרחבה רקורסיבית; הקובץ נדחה",
  FRONTMATTER_INVALID: "מבנה ה-frontmatter אינו נתמך (תת-מבנים מקוננים בשדה נתמך) — הקובץ נדחה",
};

export class FrontmatterError extends Error {
  readonly code: FrontmatterErrorCode;
  constructor(code: FrontmatterErrorCode, extra?: string) {
    super(extra ? `${FRONTMATTER_ERROR_HE[code]} (${extra})` : FRONTMATTER_ERROR_HE[code]);
    this.name = "FrontmatterError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// denylist — frontmatter can NEVER define these capability classes
// ---------------------------------------------------------------------------

/** key patterns that are rejected outright (case-insensitive). */
export const FRONTMATTER_DENYLIST_PATTERNS: readonly RegExp[] = [
  /permission/iu,
  /^(role|roles|acl|rbac|grant|grants|admin|sudo|access[_-]?(level|control|policy))$/iu,
  /system[_\s-]?prompt/iu,
  /^prompt(s)?$/iu,
  /instruction/iu,
  /approv/iu, // approve / approval / approved_by / auto_approve …
  /bypass/iu,
  /credential/iu,
  /password|passwd/iu,
  /secret/iu,
  /token/iu,
  /api[_\s-]?key/iu,
  /private[_\s-]?key/iu,
  /^auth(entication|orization)?$/iu,
  /tool[_\s-]?(access|use|call|allow)/iu,
  /^tools?$/iu,
  /^mcp/iu,
  /org(anization)?[_\s-]?(id|identity|name)/iu,
  /^tenant([_-]?id)?$/iu,
  /^(exec|eval|script|shell|command|run|code[_\s-]?exec.*)$/iu,
  /^on[_-]?(load|open|import)$/iu,
];

export function isDenylistedFrontmatterKey(key: string): boolean {
  const k = key.trim();
  // supported fields are never denylisted (they can't grant capabilities)
  if ((SUPPORTED_FRONTMATTER_FIELDS as readonly string[]).includes(k)) return false;
  return FRONTMATTER_DENYLIST_PATTERNS.some((re) => re.test(k));
}

// ---------------------------------------------------------------------------
// split + parse
// ---------------------------------------------------------------------------

/** split a markdown document into frontmatter (raw) + body. */
export function splitFrontmatter(markdown: string): FrontmatterSplit {
  if (!markdown.startsWith("---")) return { frontmatterRaw: null, body: markdown };
  const firstLineEnd = markdown.indexOf("\n");
  if (firstLineEnd === -1 || markdown.slice(0, firstLineEnd).trim() !== "---") {
    return { frontmatterRaw: null, body: markdown };
  }
  const close = /^(---|\.\.\.)\s*$/mu;
  const rest = markdown.slice(firstLineEnd + 1);
  const lines = rest.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (close.test(lines[i] ?? "")) {
      return {
        frontmatterRaw: lines.slice(0, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  // unterminated frontmatter fence — treat the whole document as body
  return { frontmatterRaw: null, body: markdown };
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().slice(1, -1);
  if (inner.trim() === "") return [];
  return inner.split(",").map((x) => unquote(x)).filter((x) => x.length > 0);
}

const ANCHOR_ALIAS_RE = /(^|\s)(&\S+|\*\S+)|<<\s*:/u;

/**
 * Parse the safe YAML subset. Throws FrontmatterError (Hebrew) on:
 * size overflow, YAML anchors/aliases, denylisted keys, unsupported nesting
 * inside a supported field.
 */
export function parseFrontmatter(frontmatterRaw: string): ParsedFrontmatter {
  const bytes = new TextEncoder().encode(frontmatterRaw).length;
  if (bytes > FRONTMATTER_MAX_BYTES) {
    throw new FrontmatterError("FRONTMATTER_TOO_LARGE");
  }
  if (ANCHOR_ALIAS_RE.test(frontmatterRaw)) {
    throw new FrontmatterError("FRONTMATTER_YAML_ALIAS");
  }

  const fields: MemoryFrontmatterFields = {};
  const extensions: Record<string, string | string[]> = {};
  const lines = frontmatterRaw.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const m = /^([^\s:][^:]*):\s*(.*)$/u.exec(line);
    if (!m) {
      // stray content (continuation/indent outside a list) — ignore safely
      i += 1;
      continue;
    }
    const key = (m[1] ?? "").trim();
    const rawValue = (m[2] ?? "").trim();
    if (isDenylistedFrontmatterKey(key)) {
      throw new FrontmatterError("FRONTMATTER_DENYLIST", key);
    }
    const supported = (SUPPORTED_FRONTMATTER_FIELDS as readonly string[]).includes(key);

    let value: string | string[];
    let consumed = 1;
    if (rawValue === "") {
      // block list (or nested map)
      const items: string[] = [];
      let j = i + 1;
      let sawNested = false;
      const nestedRaw: string[] = [];
      while (j < lines.length) {
        const sub = lines[j] ?? "";
        const li = /^\s+-\s*(.*)$/u.exec(sub);
        if (li) {
          items.push(unquote(li[1] ?? ""));
          nestedRaw.push(sub);
          j += 1;
          continue;
        }
        if (/^\s+\S/u.test(sub)) {
          // nested map / deeper structure
          sawNested = true;
          nestedRaw.push(sub);
          j += 1;
          continue;
        }
        break;
      }
      consumed = j - i;
      if (sawNested) {
        if (supported) throw new FrontmatterError("FRONTMATTER_INVALID", key);
        extensions[key] = nestedRaw.join("\n");
        i += consumed;
        continue;
      }
      value = items;
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      value = parseInlineList(rawValue);
    } else {
      value = unquote(rawValue);
    }

    if (supported) {
      const fkey = key as SupportedFrontmatterField;
      if (LIST_FIELDS.has(fkey)) {
        const list = Array.isArray(value) ? value : value === "" ? [] : [value];
        (fields as Record<string, string[]>)[fkey] = list;
      } else {
        const scalar = Array.isArray(value) ? value.join(", ") : value;
        (fields as Record<string, string>)[fkey] = scalar;
      }
    } else {
      extensions[key] = value;
    }
    i += consumed;
  }

  return { fields, extensions, raw: frontmatterRaw };
}
