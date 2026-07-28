// TERAGON Business Graph — reference-safety contracts (Phase 2).
// Encodes the "List 3 / List 4" hazards from EDGE_MAP: polymorphic "kind:id"
// strings, embedded-array targets, denormalized names and cross-org leaks. The
// classifier MAY report a reference, but an ambiguous or name-based reference
// can NEVER be promoted to authority CANONICAL (referenceMayBeAuthoritative).
import { z } from "zod";

// ---------------------------------------------------------------------------
// vocabularies
// ---------------------------------------------------------------------------

/** How a legacy reference is physically encoded in the source record. */
export const LEGACY_REFERENCE_KINDS = [
  "KIND_ID", // polymorphic "customer:cu-3"
  "EMBEDDED_TARGET", // points into an embedded array (non-global id)
  "STRING_RECORD_KEY", // a bare string key
  "DENORMALIZED_NAME", // a display name mirror (never authoritative)
] as const;
export type LegacyReferenceKind = (typeof LEGACY_REFERENCE_KINDS)[number];
export const legacyReferenceKindSchema = z.enum(LEGACY_REFERENCE_KINDS);

/** The outcome of attempting to resolve a legacy reference to a real node. */
export const REFERENCE_RESOLUTION_STATUSES = [
  "VALID",
  "MISSING_TARGET",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "CROSS_ORGANIZATION",
  "MALFORMED",
] as const;
export type ReferenceResolutionStatus = (typeof REFERENCE_RESOLUTION_STATUSES)[number];
export const referenceResolutionStatusSchema = z.enum(REFERENCE_RESOLUTION_STATUSES);

// ---------------------------------------------------------------------------
// "kind:id" parser
// ---------------------------------------------------------------------------

export type ParsedKindIdRef = { kind: string; id: string } | { malformed: true };

/**
 * Parse a polymorphic reference such as `"customer:cu-3"` or `"agent-task:at-1"`
 * into its `{ kind, id }`. Splits on the FIRST colon only. Returns
 * `{ malformed: true }` when the shape is not `kind:id` with both parts present.
 */
export function parseKindIdRef(raw: string): ParsedKindIdRef {
  if (typeof raw !== "string") return { malformed: true };
  const idx = raw.indexOf(":");
  if (idx <= 0) return { malformed: true };
  const kind = raw.slice(0, idx).trim();
  const id = raw.slice(idx + 1).trim();
  if (!kind || !id) return { malformed: true };
  return { kind, id };
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------

export interface ReferenceResolution {
  status: ReferenceResolutionStatus;
  kind: LegacyReferenceKind;
  note: string;
}

export const referenceResolutionSchema = z.object({
  status: referenceResolutionStatusSchema,
  kind: legacyReferenceKindSchema,
  note: z.string(),
}) satisfies z.ZodType<ReferenceResolution>;

export interface ClassifyReferenceInput {
  raw: string;
  kind: LegacyReferenceKind;
  /** the viewer's organization — used to detect a cross-org target */
  viewerOrganizationId: string;
  /** the resolved target's organization, if a unique target was found */
  targetOrganizationId?: string | null;
  /** how many candidate records matched (0 = none, >1 = ambiguous) */
  candidateCount?: number;
}

/**
 * Classify (report on) a legacy reference. This NEVER mutates and NEVER
 * upgrades a reference to authoritative — it only labels it. A DENORMALIZED_NAME
 * or EMBEDDED_TARGET is inherently non-authoritative; a KIND_ID/STRING_RECORD_KEY
 * is VALID only when it parses, resolves to exactly one same-org target.
 */
export function classifyReference(input: ClassifyReferenceInput): ReferenceResolution {
  const { raw, kind, viewerOrganizationId, targetOrganizationId, candidateCount } = input;

  if (kind === "DENORMALIZED_NAME") {
    return {
      status: "AMBIGUOUS",
      kind,
      note: "הפניה לפי שם תצוגה — לעולם אינה סמכותית (הומונימים/שינוי שם מנתקים)",
    };
  }

  if (kind === "EMBEDDED_TARGET") {
    return {
      status: "UNSUPPORTED",
      kind,
      note: "יעד מוטמע במערך (מזהה לא-גלובלי) — אינו ניתן לרזולוציה לצומת גלובלי",
    };
  }

  // KIND_ID / STRING_RECORD_KEY — must parse (KIND_ID) then resolve.
  if (kind === "KIND_ID") {
    const parsed = parseKindIdRef(raw);
    if ("malformed" in parsed) {
      return { status: "MALFORMED", kind, note: `הפניה "${raw}" אינה בפורמט kind:id` };
    }
  } else if (!raw.trim()) {
    return { status: "MALFORMED", kind, note: "מפתח רשומה ריק אינו חוקי" };
  }

  const count = candidateCount ?? (targetOrganizationId === undefined ? 0 : 1);
  if (count === 0) {
    return { status: "MISSING_TARGET", kind, note: `לא נמצאה רשומת יעד עבור "${raw}"` };
  }
  if (count > 1) {
    return { status: "AMBIGUOUS", kind, note: `"${raw}" מתאים ל-${count} רשומות — רב-משמעי` };
  }
  if (targetOrganizationId != null && targetOrganizationId !== viewerOrganizationId) {
    return {
      status: "CROSS_ORGANIZATION",
      kind,
      note: `יעד בארגון אחר (${targetOrganizationId}) — מעבר בין ארגונים אסור`,
    };
  }
  return { status: "VALID", kind, note: "רזולוציה חד-חד-ערכית באותו ארגון" };
}

/**
 * Deny-by-default gate: may this classified reference back an AUTHORITATIVE
 * edge? Only a VALID resolution that is NOT a denormalized name qualifies.
 * Everything else (ambiguous, missing, malformed, cross-org, unsupported, or
 * any name-based reference) is refused.
 */
export function referenceMayBeAuthoritative(res: ReferenceResolution): boolean {
  if (res.kind === "DENORMALIZED_NAME") return false;
  return res.status === "VALID";
}
