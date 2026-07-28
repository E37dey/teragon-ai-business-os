// TERAGON Business Graph — derivation internals (Phase 3, PURE).
// Defensive field readers, clock-free authoritative predicates, sensitivity /
// title / metadata projection, organization resolution, the deterministic edge
// id builder, and the issue factory. Nothing here reads a repository or a clock.
import {
  buildNodeId,
  classifyOrganization,
  graphEntityRefSchema,
  isArrayPositionId,
  toGraphEdgeId,
  type GraphEdgeId,
  type GraphEntityRef,
  type GraphEntityType,
  type GraphNodeId,
} from "../contracts/identity";
import {
  GRAPH_SENSITIVITIES,
  type GraphMetadataValue,
  type GraphSensitivity,
} from "../contracts/node";
import type { EntityRegistryEntry } from "../registry/entityRegistry";
import type {
  CanonicalRecord,
  DerivationIssueCode,
  DerivationSeverity,
  GraphDerivationContext,
  GraphDerivationIssue,
} from "./types";

// ---------------------------------------------------------------------------
// defensive field access
// ---------------------------------------------------------------------------

/** Read a (possibly dotted) field path off an opaque record; undefined if absent. */
export function readField(record: CanonicalRecord, path: string): unknown {
  const segments = path.split(".");
  let cursor: unknown = record;
  for (const seg of segments) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

/** A non-empty string, or null. */
export function readStringField(record: CanonicalRecord, path: string): string | null {
  const v = readField(record, path);
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** True when a value is "present" (non-null, non-empty, not literal false). */
export function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (v === false) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// ---------------------------------------------------------------------------
// clock-free authoritative predicates (never invent an approval; no `now`)
// ---------------------------------------------------------------------------

/**
 * Named authoritativeStrategy predicates from the entity registry, implemented
 * WITHOUT a clock. Time-relative expiry (effective-now / reviewDate) is a
 * runtime staleness concern, out of scope for pure derivation — so these use
 * only the record's own state fields, and default to non-authoritative when the
 * required state is absent (honest deny-by-default).
 */
export const AUTHORITATIVE_PREDICATES: Record<string, (r: CanonicalRecord) => boolean> = {
  quotationApproved: (r) => readField(r, "status") === "אושרה",
  // a recommendation that does not require approval is trusted; one that does is
  // not authoritative until a human approval re-classifies it (edge-level).
  recommendationApproved: (r) => readField(r, "approvalRequired") === false,
  memoryAuthoritative: (r) =>
    readField(r, "approvalState") === "מאושר" && !isPresent(readField(r, "archivedAt")),
  isAuthoritative: (r) => {
    const approved = readField(r, "approved");
    if (typeof approved === "boolean") return approved; // legacy KnowledgeNote
    return (
      readField(r, "approval.state") === "מאושר" &&
      readField(r, "archived") !== true &&
      isPresent(readField(r, "effectiveDate"))
    );
  },
  learningRuleActive: (r) => readField(r, "status") === "פעיל",
  policyActive: (r) => readField(r, "status") === "פעילה",
};

// ---------------------------------------------------------------------------
// node projection helpers
// ---------------------------------------------------------------------------

const TITLE_FIELDS = ["title", "name", "label"] as const;

export function computeTitle(
  record: CanonicalRecord,
  entityType: GraphEntityType,
  entityId: string,
): string {
  for (const f of TITLE_FIELDS) {
    const v = readStringField(record, f);
    if (v !== null) return v;
  }
  return `${entityType}:${entityId}`;
}

export function computeSensitivity(
  record: CanonicalRecord,
  entry: EntityRegistryEntry,
): GraphSensitivity {
  const fallback: GraphSensitivity = entry.payloadExposure === "protected" ? "רגיש" : "פנימי";
  const strat = entry.sensitivityStrategy;
  if (strat.kind === "constant") return strat.value;
  if (strat.kind === "field") {
    const v = readField(record, strat.field);
    if (typeof v === "string" && (GRAPH_SENSITIVITIES as readonly string[]).includes(v)) {
      return v as GraphSensitivity;
    }
    if (typeof v === "boolean") return v ? "פנימי" : "רגיש";
  }
  return fallback;
}

export function computeArchived(record: CanonicalRecord, entry: EntityRegistryEntry): boolean {
  return entry.archiveField ? isPresent(readField(record, entry.archiveField)) : false;
}

export function computeSuperseded(record: CanonicalRecord, entry: EntityRegistryEntry): boolean {
  return entry.supersedeField ? isPresent(readField(record, entry.supersedeField)) : false;
}

export function computeAuthoritative(
  record: CanonicalRecord,
  entry: EntityRegistryEntry,
): boolean {
  if (computeArchived(record, entry) || computeSuperseded(record, entry)) return false;
  const strat = entry.authoritativeStrategy;
  if (strat.kind === "constant") return strat.value;
  if (strat.kind === "field") return Boolean(readField(record, strat.field));
  const predicate = AUTHORITATIVE_PREDICATES[strat.name];
  return predicate ? predicate(record) : false;
}

/** Fields whose values are free-text bodies — NEVER projected onto a node. */
const BODY_DENYLIST: ReadonlySet<string> = new Set([
  "notes",
  "description",
  "content",
  "markdown",
  "bodyMarkdown",
  "plainText",
  "prompt",
  "reason",
  "terms",
  "blurb",
  "note",
  "solution",
  "details",
  "excerpt",
  "issue",
  "text",
  "summary",
  "moreSourcesRequestHe",
  "resolutionHe",
]);

const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "title",
  "name",
  "label",
]);

/**
 * Project the envelope-SAFE scalar fields of a record into metadataSummary.
 * Only string/number/boolean/null scalars survive, and any free-text body key
 * is refused — a sensitive body can never ride along on a node.
 */
export function computeMetadataSummary(
  record: CanonicalRecord,
  extra: Record<string, GraphMetadataValue> = {},
): Record<string, GraphMetadataValue> {
  const out: Record<string, GraphMetadataValue> = {};
  for (const key of Object.keys(record).sort()) {
    if (STRUCTURAL_KEYS.has(key) || BODY_DENYLIST.has(key)) continue;
    const v = record[key];
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (typeof v === "string" && v.length > 120) continue; // long strings look like bodies
      out[key] = v;
    }
  }
  for (const [k, v] of Object.entries(extra)) out[k] = v;
  return out;
}

export function computeOwnerRef(
  record: CanonicalRecord,
  organizationId: string,
): GraphEntityRef | null {
  const ownerId = readStringField(record, "ownerId");
  if (ownerId === null || isArrayPositionId(ownerId)) return null;
  const candidate: GraphEntityRef = { organizationId, entityType: "user", entityId: ownerId };
  return graphEntityRefSchema.safeParse(candidate).success ? candidate : null;
}

// ---------------------------------------------------------------------------
// organization resolution (never invent an org)
// ---------------------------------------------------------------------------

export interface OrgResolution {
  organizationId: string | null;
  inherited: boolean;
  /** true only when the record structurally has no own org and could not inherit */
  unmappable: boolean;
}

/**
 * Resolve the organization for a record. A concrete own-org field wins. When it
 * is missing/blank the record may adopt context.organizationId ONLY when the
 * entity is graph-eligible (org-scoped), allowOrgInheritance is set, and the
 * caller supplied an organizationId — otherwise it is UNMAPPABLE. Never invents.
 */
export function resolveOrganization(
  record: CanonicalRecord,
  entry: EntityRegistryEntry,
  context: GraphDerivationContext,
): OrgResolution {
  const raw = entry.organizationField ? readField(record, entry.organizationField) : undefined;
  const classified = classifyOrganization(
    typeof raw === "string" ? raw : raw === null ? null : undefined,
  );
  if (classified.status === "mapped") {
    return { organizationId: classified.organizationId, inherited: false, unmappable: false };
  }
  const canInherit =
    entry.graphEligible &&
    context.allowOrgInheritance === true &&
    typeof context.organizationId === "string" &&
    context.organizationId.trim() !== "";
  if (canInherit) {
    return { organizationId: context.organizationId, inherited: true, unmappable: false };
  }
  return { organizationId: null, inherited: false, unmappable: true };
}

// ---------------------------------------------------------------------------
// deterministic edge id (stable values ONLY — no time / position / display name)
// ---------------------------------------------------------------------------

/**
 * Build a deterministic edge id from stable values only:
 * organizationId + sourceNodeId + relationshipType + targetNodeId + a stable
 * relationship discriminator (the source field name). NO timestamps, array
 * positions, iteration order, or display names — identical input ⇒ identical id.
 */
export function buildEdgeId(args: {
  organizationId: string;
  source: GraphNodeId;
  relationshipType: string;
  target: GraphNodeId;
  discriminator: string;
}): GraphEdgeId {
  const tuple = [
    args.organizationId,
    args.source,
    args.relationshipType,
    args.target,
    args.discriminator,
  ].join("|");
  return toGraphEdgeId(`edge:${tuple}`);
}

/** Build a node id, or null when the ref is unsafe (array-position id, etc.). */
export function safeNodeId(
  organizationId: string,
  entityType: GraphEntityType,
  entityId: string,
): GraphNodeId | null {
  const ref: GraphEntityRef = { organizationId, entityType, entityId };
  if (!graphEntityRefSchema.safeParse(ref).success) return null;
  try {
    return buildNodeId(ref);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// issue factory
// ---------------------------------------------------------------------------

interface IssueTemplate {
  severity: DerivationSeverity;
  reasonHe: string;
  safeRemediationHe: string;
  indexingMayContinue: boolean;
}

const ISSUE_TEMPLATES: Record<DerivationIssueCode, IssueTemplate> = {
  MISSING_ORGANIZATION: {
    severity: "error",
    reasonHe: "לרשומה אין ארגון בר-שיוך — אין לשייך ארגון באופן שקט",
    safeRemediationHe: "ספק organizationId או הפעל allowOrgInheritance עם ארגון הקשר",
    indexingMayContinue: false,
  },
  MISSING_TARGET: {
    severity: "warning",
    reasonHe: "יעד ההפניה אינו קיים (FK שבור/חסר)",
    safeRemediationHe: "אין ליצור קשת סמכותית; יש לתקן את ה-FK או להשמיט את ההפניה",
    indexingMayContinue: true,
  },
  AMBIGUOUS_REFERENCE: {
    severity: "warning",
    reasonHe: "הפניה מבוססת-שם/רב-משמעית — אינה ניתנת לרזולוציה סמכותית",
    safeRemediationHe: "יש להחליף בהפניית מזהה יציבה; קשת מועמדת נשארת UNVERIFIED",
    indexingMayContinue: true,
  },
  MALFORMED_REFERENCE: {
    severity: "warning",
    reasonHe: "מחרוזת ההפניה אינה בפורמט kind:id תקין",
    safeRemediationHe: "יש לתקן את מבנה ההפניה; לא נוצרה קשת",
    indexingMayContinue: true,
  },
  UNSUPPORTED_REFERENCE: {
    severity: "info",
    reasonHe: "סוג הפניה שאינו נתמך לרזולוציה גלובלית (למשל יעד מוטמע)",
    safeRemediationHe: "אין ליצור קשת; ההפניה נרשמת בלבד",
    indexingMayContinue: true,
  },
  CROSS_ORGANIZATION: {
    severity: "error",
    reasonHe: "היעד שייך לארגון אחר — מעבר בין ארגונים אסור",
    safeRemediationHe: "אין ליצור קשת חוצת-ארגונים; יש לבדוק את שיוך הארגון",
    indexingMayContinue: true,
  },
  INELIGIBLE_TARGET: {
    severity: "warning",
    reasonHe: "היעד אינו כשיר לשמש צומת גרף",
    safeRemediationHe: "אין ליצור קשת סמכותית ליעד לא-כשיר",
    indexingMayContinue: true,
  },
  ARCHIVED_SOURCE: {
    severity: "info",
    reasonHe: "רשומת המקור בארכיון — לא תהפוך לקשת סמכותית",
    safeRemediationHe: "הקשת נגזרת אך אינה סמכותית",
    indexingMayContinue: true,
  },
  SUPERSEDED_SOURCE: {
    severity: "info",
    reasonHe: "רשומת המקור הוחלפה (superseded)",
    safeRemediationHe: "הקשת מסומנת בהתאם ואינה סמכותית",
    indexingMayContinue: true,
  },
  DUPLICATE_EDGE: {
    severity: "warning",
    reasonHe: "קשת כפולה זוהתה (אותו מזהה קשת דטרמיניסטי)",
    safeRemediationHe: "יש לשמור מופע יחיד; הכפילות מדווחת",
    indexingMayContinue: true,
  },
  ORPHAN_NODE: {
    severity: "info",
    reasonHe: "צומת ללא קשתות נכנסות או יוצאות",
    safeRemediationHe: "אין פעולה נדרשת; ייתכן שהקשרים טרם נגזרו",
    indexingMayContinue: true,
  },
  SENSITIVITY_BLOCKED: {
    severity: "error",
    reasonHe: "תוכן רגיש היה נדרש על צומת/קשת — חסום לפי חוזה המעטפה",
    safeRemediationHe: "יש להשתמש ב-ProtectedPayloadReference; הגוף אינו מועתק",
    indexingMayContinue: true,
  },
  NON_AUTHORITATIVE_SOURCE: {
    severity: "info",
    reasonHe: "מקור לא-סמכותי — הקשת אינה יכולה להיות CANONICAL",
    safeRemediationHe: "הקשת נשארת UNVERIFIED/DERIVED עד אימות",
    indexingMayContinue: true,
  },
  ORG_SCOPE_INHERITED: {
    severity: "info",
    reasonHe: "ארגון הרשומה נגזר מהקשר (org-scope inherited)",
    safeRemediationHe: "אין פעולה נדרשת; השיוך תועד במפורש",
    indexingMayContinue: true,
  },
  EXCLUDED_ENTITY: {
    severity: "info",
    reasonHe: "סוג ישות מוחרג מגזירת הגרף בשלב זה",
    safeRemediationHe: "אין לגזור צומת/קשת; ראה DERIVATION_STATUS",
    indexingMayContinue: true,
  },
  UNMAPPABLE_ENTITY: {
    severity: "warning",
    reasonHe: "הרשומה אינה ניתנת למיפוי לצומת גרף",
    safeRemediationHe: "יש לבדוק את הגדרות ה-registry עבור סוג הישות",
    indexingMayContinue: false,
  },
  DANGLING_ENDPOINT: {
    severity: "error",
    reasonHe: "קצה קשת מפנה לצומת שאינו בתמונת המצב",
    safeRemediationHe: "אין לכלול קשת עם קצה תלוי; יש לגזור את צומת היעד",
    indexingMayContinue: true,
  },
};

export function makeIssue(
  code: DerivationIssueCode,
  sourceEntityType: GraphEntityType,
  sourceEntityId: string,
  extra: Partial<Pick<GraphDerivationIssue, "field" | "attemptedRelationship" | "reasonHe">> = {},
): GraphDerivationIssue {
  const t = ISSUE_TEMPLATES[code];
  return {
    code,
    sourceEntityType,
    sourceEntityId,
    severity: t.severity,
    reasonHe: extra.reasonHe ?? t.reasonHe,
    safeRemediationHe: t.safeRemediationHe,
    indexingMayContinue: t.indexingMayContinue,
    ...(extra.field !== undefined ? { field: extra.field } : {}),
    ...(extra.attemptedRelationship !== undefined
      ? { attemptedRelationship: extra.attemptedRelationship }
      : {}),
  };
}
