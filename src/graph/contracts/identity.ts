// TERAGON Business Graph — stable identity contracts (Phase 2).
// The graph is a DERIVED, READ-ONLY contract layer over the canonical
// repositories. This module owns the CLOSED entity-type vocabulary, the
// branded node/edge id types, and the defensive parsers/validators that refuse
// the migration hazards catalogued in BUSINESS_GRAPH_ENTITY_MAP.md §"Migration-
// risk register" (array-index ids, display names, missing organization, unknown
// entity types). No storage, no indexing — contracts only.
import { z } from "zod";

// ---------------------------------------------------------------------------
// closed entity-type vocabulary
// ---------------------------------------------------------------------------

/**
 * The CLOSED set of mapped graph entity types (37). Derived from the Phase-1
 * ENTITY_MAP. Deliberate exclusions: `permission` (an enum vocabulary, not a
 * persisted record — never a node) and `stageProgress` (embedded inside
 * Enrollment.stages, synthesized not stored). PrinterModel/CustomerPrinter and
 * agentRun/agentEvent are kept SEPARATE — the node factory must never conflate
 * a catalog model with a customer instance, or a run with its events.
 */
export const GRAPH_ENTITY_TYPES = [
  "organization",
  "user",
  "role",
  "customer",
  "contact",
  "lead",
  "opportunity",
  "quotation",
  "product",
  "printerModel",
  "customerPrinter",
  "serviceTicket",
  "repairAction",
  "course",
  "student",
  "enrollment",
  "task",
  "document",
  "automation",
  "automationRun",
  "agent",
  "agentRun",
  "agentEvent",
  "aiRecommendation",
  "approval",
  "auditEvent",
  "memoryRecord",
  "knowledgeArticle",
  "learningObservation",
  "learningProposal",
  "learningRule",
  "metricDefinition",
  "metricObservation",
  "governancePolicy",
  "governanceRisk",
  "governanceIncident",
  "submissionDeliverable",
] as const;

export type GraphEntityType = (typeof GRAPH_ENTITY_TYPES)[number];

export const graphEntityTypeSchema = z.enum(GRAPH_ENTITY_TYPES);

const ENTITY_TYPE_SET: ReadonlySet<string> = new Set(GRAPH_ENTITY_TYPES);

/** Type-guard: is `s` one of the closed graph entity types? */
export function isGraphEntityType(s: string): s is GraphEntityType {
  return ENTITY_TYPE_SET.has(s);
}

// ---------------------------------------------------------------------------
// branded ids
// ---------------------------------------------------------------------------

declare const graphNodeIdBrand: unique symbol;
/** A node id PROVEN to be of the canonical `teragon://…` shape. */
export type GraphNodeId = string & { readonly [graphNodeIdBrand]: true };

declare const graphEdgeIdBrand: unique symbol;
/** An edge id (opaque, allocated by the future index; branded for safety). */
export type GraphEdgeId = string & { readonly [graphEdgeIdBrand]: true };

/** Cast a raw string to a GraphEdgeId (the index owns edge-id allocation). */
export function toGraphEdgeId(raw: string): GraphEdgeId {
  if (!raw.trim()) {
    throw new GraphIdentityError("GRAPH_ID_MALFORMED", "מזהה קשת ריק אינו חוקי");
  }
  return raw as GraphEdgeId;
}

// ---------------------------------------------------------------------------
// entity reference
// ---------------------------------------------------------------------------

/**
 * A reference to a canonical record. `organizationId` is REQUIRED — a record
 * with no resolvable organization is `unmappable` (see classifyOrganization),
 * never silently assigned one.
 */
export interface GraphEntityRef {
  organizationId: string;
  entityType: GraphEntityType;
  entityId: string;
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type GraphIdentityErrorCode =
  | "GRAPH_ID_MALFORMED"
  | "GRAPH_ID_UNKNOWN_ENTITY_TYPE"
  | "GRAPH_ID_MISSING_ORG"
  | "GRAPH_ID_ARRAY_POSITION"
  | "GRAPH_ID_DISPLAY_NAME";

export class GraphIdentityError extends Error {
  readonly code: GraphIdentityErrorCode;
  readonly detailHe: string;

  constructor(code: GraphIdentityErrorCode, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "GraphIdentityError";
    this.code = code;
    this.detailHe = detailHe;
  }
}

// ---------------------------------------------------------------------------
// hazard predicates
// ---------------------------------------------------------------------------

/**
 * True when `s` looks like a bare array position (`"0"`, `"1"`, `"12"` …).
 * Such a value is an index into a denormalized array, never a stable record id
 * — indexing it as a node id would silently bind to whatever currently sits at
 * that position. Rejected everywhere an entityId is accepted.
 */
export function isArrayPositionId(s: string): boolean {
  return /^\d+$/u.test(s.trim());
}

// ---------------------------------------------------------------------------
// organization classification (never invent an org)
// ---------------------------------------------------------------------------

export type OrgUnmappableReason = "MISSING_ORG" | "BLANK_ORG";

export type OrgClassification =
  | { status: "mapped"; organizationId: string }
  | { status: "unmappable"; reasonCode: OrgUnmappableReason; reasonHe: string };

/**
 * Classify a record's raw organization value. A missing/blank organization is
 * reported as `unmappable` — the graph NEVER fabricates `org-teragon` (or any
 * placeholder) for it (see SECURITY_MODEL §1: the dangling-org risk). Note this
 * is a contract classifier: it does not check org membership (there is no org
 * registry at the contract layer) — it only refuses to invent one.
 */
export function classifyOrganization(raw: string | null | undefined): OrgClassification {
  if (raw === null || raw === undefined) {
    return {
      status: "unmappable",
      reasonCode: "MISSING_ORG",
      reasonHe: "לרשומה אין שדה ארגון — אין לשייך ארגון באופן שקט",
    };
  }
  if (raw.trim() === "") {
    return {
      status: "unmappable",
      reasonCode: "BLANK_ORG",
      reasonHe: "שדה הארגון ריק — אין לשייך ארגון באופן שקט",
    };
  }
  return { status: "mapped", organizationId: raw };
}

// ---------------------------------------------------------------------------
// zod schemas
// ---------------------------------------------------------------------------

/** Shared ISO-date validator (mirrors the domain schemas' pattern). */
export const graphIsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/u, {
    message: "תאריך חייב להיות בפורמט ISO (YYYY-MM-DD)",
  });

export const graphEntityRefSchema = z
  .object({
    organizationId: z.string().min(1, "organizationId חובה"),
    entityType: graphEntityTypeSchema,
    entityId: z.string().min(1, "entityId חובה"),
  })
  .superRefine((val, ctx) => {
    if (val.organizationId.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: "organizationId ריק אינו חוקי — אין לשייך ארגון באופן שקט",
        path: ["organizationId"],
      });
    }
    if (isArrayPositionId(val.entityId)) {
      ctx.addIssue({
        code: "custom",
        message: "מזהה שנראה כאינדקס מערך (מספר בלבד) אסור — אינו מזהה יציב",
        path: ["entityId"],
      });
    }
    if (/\s/u.test(val.entityId)) {
      ctx.addIssue({
        code: "custom",
        message: "מזהה לא יכול להכיל רווחים — שם תצוגה אינו מזהה",
        path: ["entityId"],
      });
    }
  }) satisfies z.ZodType<GraphEntityRef>;

// ---------------------------------------------------------------------------
// node-id build / parse (round-trip)
// ---------------------------------------------------------------------------

const NODE_ID_PREFIX = "teragon://";

/** Build the canonical node id `teragon://{org}/{entityType}/{entityId}`. */
export function buildNodeId(ref: GraphEntityRef): GraphNodeId {
  const parsed = graphEntityRefSchema.parse(ref);
  return `${NODE_ID_PREFIX}${parsed.organizationId}/${parsed.entityType}/${parsed.entityId}` as GraphNodeId;
}

/**
 * Parse a node id back into its ref, throwing a typed GraphIdentityError on any
 * malformation. Rejects: wrong prefix/shape, missing organization, unknown
 * entity type, and array-position entity ids.
 */
export function parseNodeId(id: string): GraphEntityRef {
  if (typeof id !== "string" || !id.startsWith(NODE_ID_PREFIX)) {
    throw new GraphIdentityError(
      "GRAPH_ID_MALFORMED",
      `מזהה צומת חייב להתחיל ב-"${NODE_ID_PREFIX}" — התקבל "${id}"`,
    );
  }
  const segments = id.slice(NODE_ID_PREFIX.length).split("/");
  if (segments.length !== 3) {
    throw new GraphIdentityError(
      "GRAPH_ID_MALFORMED",
      `מזהה צומת חייב להיות בעל שלושה חלקים org/type/id — התקבל "${id}"`,
    );
  }
  const [organizationId, entityType, entityId] = segments;
  if (!organizationId) {
    throw new GraphIdentityError("GRAPH_ID_MISSING_ORG", "חסר מזהה ארגון במזהה הצומת");
  }
  if (!entityType || !isGraphEntityType(entityType)) {
    throw new GraphIdentityError(
      "GRAPH_ID_UNKNOWN_ENTITY_TYPE",
      `סוג ישות לא מוכר במזהה הצומת: "${entityType ?? ""}"`,
    );
  }
  if (!entityId) {
    throw new GraphIdentityError("GRAPH_ID_MALFORMED", "חסר מזהה ישות במזהה הצומת");
  }
  if (isArrayPositionId(entityId)) {
    throw new GraphIdentityError(
      "GRAPH_ID_ARRAY_POSITION",
      `מזהה ישות שנראה כאינדקס מערך אסור: "${entityId}"`,
    );
  }
  if (/\s/u.test(entityId)) {
    throw new GraphIdentityError(
      "GRAPH_ID_DISPLAY_NAME",
      `מזהה ישות לא יכול להכיל רווחים (שם תצוגה): "${entityId}"`,
    );
  }
  return { organizationId, entityType, entityId };
}

/** Zod schema that accepts ONLY a well-formed, safe node id string. */
export const graphNodeIdSchema = z.string().superRefine((val, ctx) => {
  try {
    parseNodeId(val);
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: e instanceof GraphIdentityError ? e.detailHe : "מזהה צומת לא תקין",
    });
  }
});
