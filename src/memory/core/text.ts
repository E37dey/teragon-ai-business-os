// TERAGON AI BUSINESS OS — deterministic text utilities for the memory
// domain (Wave 6, W6-A). Everything here is a pure function: same input ⇒
// same output (no Date.now, no randomness) — duplicate/contradiction checks
// build on these and are unit-tested for determinism.

/** Deterministic slug: lowercase, spaces/punct → "-", Hebrew kept as-is. */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/["'״׳`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
}

/** Extract [[wikilink]] targets from markdown (order preserved, de-duped). */
export function extractWikiLinks(markdown: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const target = (m[1] ?? "").trim();
    if (target && !out.includes(target)) out.push(target);
  }
  return out;
}

/** Strip markdown syntax to plain text (deterministic, no HTML involved). */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/gu, (_all, target: string, alias?: string) =>
      alias && alias.trim() ? alias.trim() : target.trim(),
    )
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/^\s*[-*+]\s+/gmu, "")
    .replace(/^\s*\d+\.\s+/gmu, "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Normalized word tokens for similarity (Hebrew + latin, lowercased). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/["'״׳`]/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

/**
 * Deterministic title similarity: Jaccard over normalized token sets,
 * rounded to 3 decimals so threshold comparisons are stable.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return Math.round((inter / union) * 1000) / 1000;
}

/**
 * Deterministic claim extraction: lines shaped "מפתח: ערך" (2–40 chars key)
 * become normalized key/value claims — the basis of contradiction detection.
 * Keys are token-joined so "ערוץ מועדף : וואטסאפ" ≡ "ערוץ מועדף: וואטסאפ".
 */
export interface ExtractedClaim {
  key: string;
  value: string;
}

export function extractClaims(plainText: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  for (const line of plainText.split("\n")) {
    const m = /^([^:\n]{2,40}):\s*(.+)$/u.exec(line.trim());
    if (!m) continue;
    const key = tokenize(m[1] ?? "").join(" ");
    const value = tokenize(m[2] ?? "").join(" ");
    if (key && value) claims.push({ key, value });
  }
  return claims;
}

/**
 * Deterministic sensitivity signal scan. Returns the MINIMUM sensitivity the
 * content suggests, by keyword/pattern families — never lowers, only flags.
 */
export function suggestedSensitivity(text: string): "פנימי" | "רגיש" | "מוגבל" | null {
  const restricted = [/ת\.?ז\.?/u, /שכר/u, /סיסמ/u, /אשראי/u];
  const sensitive = [/טלפון/u, /אימייל/u, /מייל/u, /כתובת/u, /מחיר עלות/u, /הנחה חריגה/u, /05\d[-\s]?\d{7}/u];
  const internal = [/₪/u, /תמחור/u, /רווח/u];
  if (restricted.some((re) => re.test(text))) return "מוגבל";
  if (sensitive.some((re) => re.test(text))) return "רגיש";
  if (internal.some((re) => re.test(text))) return "פנימי";
  return null;
}
