// TERAGON Business Graph — edge contract (Phase 2).
// The 22 CLOSED relationship types plus the provenance/authority/staleness
// vocabulary. The zod schema enforces the non-negotiable trust invariants from
// EDGE_MAP §2 and SECURITY_MODEL §4/§5:
//   (a) only an EXPLICIT edge may be CANONICAL;
//   (b) a PROPOSED edge is always UNVERIFIED and never approved;
//   (c) a REJECTED-authority edge can never be approved;
//   plus: no cross-organization edge (source.org === target.org === edge.org).
import { z } from "zod";
import type { ISODate } from "@/domain/types";
import {
  graphEntityRefSchema,
  graphIsoDateSchema,
  graphNodeIdSchema,
  parseNodeId,
  type GraphEdgeId,
  type GraphEntityRef,
  type GraphNodeId,
} from "./identity";
import { graphSensitivitySchema, type GraphSensitivity } from "./node";

// ---------------------------------------------------------------------------
// closed relationship-type vocabulary (22)
// ---------------------------------------------------------------------------

export const GRAPH_RELATIONSHIP_TYPES = [
  "OWNS",
  "CONTACT_FOR",
  "CREATED",
  "ASSIGNED_TO",
  "RELATED_TO",
  "USES",
  "SUPPORTED_BY",
  "RESOLVED_BY",
  "RECOMMENDED",
  "APPROVED_BY",
  "REJECTED_BY",
  "GENERATED_TASK",
  "ENROLLED_IN",
  "PURCHASED",
  "QUOTED_FOR",
  "SERVICED",
  "MENTIONED_IN",
  "DERIVED_FROM",
  "SUPERSEDES",
  "CONTRADICTS",
  "VERSION_OF",
  "AUDITS",
] as const;

export type GraphRelationshipType = (typeof GRAPH_RELATIONSHIP_TYPES)[number];

export const graphRelationshipTypeSchema = z.enum(GRAPH_RELATIONSHIP_TYPES);

// ---------------------------------------------------------------------------
// provenance / authority / staleness / direction / approval
// ---------------------------------------------------------------------------

export const GRAPH_PROVENANCES = [
  "EXPLICIT",
  "FOREIGN_KEY_DERIVED",
  "INFERRED",
  "PROPOSED",
] as const;
export type GraphProvenance = (typeof GRAPH_PROVENANCES)[number];
export const graphProvenanceSchema = z.enum(GRAPH_PROVENANCES);

export const GRAPH_AUTHORITIES = ["CANONICAL", "DERIVED", "UNVERIFIED", "REJECTED"] as const;
export type GraphAuthority = (typeof GRAPH_AUTHORITIES)[number];
export const graphAuthoritySchema = z.enum(GRAPH_AUTHORITIES);

export const GRAPH_EDGE_STALE_STATES = [
  "FRESH",
  "STALE",
  "BROKEN",
  "SUPERSEDED",
  "UNRESOLVED",
] as const;
export type GraphEdgeStaleState = (typeof GRAPH_EDGE_STALE_STATES)[number];
export const graphEdgeStaleStateSchema = z.enum(GRAPH_EDGE_STALE_STATES);

export const GRAPH_EDGE_DIRECTIONS = ["directed", "bidirectional"] as const;
export type GraphEdgeDirection = (typeof GRAPH_EDGE_DIRECTIONS)[number];
export const graphEdgeDirectionSchema = z.enum(GRAPH_EDGE_DIRECTIONS);

export const GRAPH_EDGE_APPROVAL_STATES = ["none", "pending", "approved", "rejected"] as const;
export type GraphEdgeApprovalState = (typeof GRAPH_EDGE_APPROVAL_STATES)[number];
export const graphEdgeApprovalStateSchema = z.enum(GRAPH_EDGE_APPROVAL_STATES);

// ---------------------------------------------------------------------------
// edge
// ---------------------------------------------------------------------------

export interface BusinessGraphEdge {
  id: GraphEdgeId;
  organizationId: string;
  relationshipType: GraphRelationshipType;
  source: GraphNodeId;
  target: GraphNodeId;
  direction: GraphEdgeDirection;
  provenance: GraphProvenance;
  authority: GraphAuthority;
  evidenceRefs: GraphEntityRef[];
  sensitivity: GraphSensitivity;
  approvalState: GraphEdgeApprovalState;
  validFrom: ISODate;
  validUntil: ISODate | null;
  createdAt: ISODate;
  createdBy: GraphEntityRef | null;
  version: number;
  staleState: GraphEdgeStaleState;
}

/**
 * Whether an edge may be treated as current authoritative truth. Deny-by-
 * default: PROPOSED/UNVERIFIED/REJECTED are never authoritative; only a
 * CANONICAL or DERIVED edge (already refined so CANONICAL ⇒ EXPLICIT) qualifies.
 */
export function edgeIsAuthoritative(
  edge: Pick<BusinessGraphEdge, "authority" | "provenance" | "approvalState">,
): boolean {
  if (edge.authority === "REJECTED" || edge.authority === "UNVERIFIED") return false;
  if (edge.provenance === "PROPOSED") return false;
  return edge.authority === "CANONICAL" || edge.authority === "DERIVED";
}

export const businessGraphEdgeSchema = z
  .object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    relationshipType: graphRelationshipTypeSchema,
    source: graphNodeIdSchema,
    target: graphNodeIdSchema,
    direction: graphEdgeDirectionSchema,
    provenance: graphProvenanceSchema,
    authority: graphAuthoritySchema,
    evidenceRefs: z.array(graphEntityRefSchema),
    sensitivity: graphSensitivitySchema,
    approvalState: graphEdgeApprovalStateSchema,
    validFrom: graphIsoDateSchema,
    validUntil: graphIsoDateSchema.nullable(),
    createdAt: graphIsoDateSchema,
    createdBy: graphEntityRefSchema.nullable(),
    version: z.number().int().min(1),
    staleState: graphEdgeStaleStateSchema,
  })
  .superRefine((val, ctx) => {
    // (a) only an EXPLICIT edge may claim CANONICAL authority.
    if (val.authority === "CANONICAL" && val.provenance !== "EXPLICIT") {
      ctx.addIssue({
        code: "custom",
        message:
          "רק קשת EXPLICIT יכולה להיות CANONICAL — קשת נגזרת/מוסקת/מוצעת לעולם אינה סמכותית",
        path: ["authority"],
      });
    }
    // (b) a PROPOSED edge is always UNVERIFIED and never approved.
    if (val.provenance === "PROPOSED") {
      if (val.authority !== "UNVERIFIED") {
        ctx.addIssue({
          code: "custom",
          message: "קשת מוצעת (PROPOSED) חייבת להיות UNVERIFIED — הצעה אינה סמכות",
          path: ["authority"],
        });
      }
      if (val.approvalState === "approved") {
        ctx.addIssue({
          code: "custom",
          message: "קשת מוצעת לעולם אינה 'approved' — נדרש אישור אנושי לפני שהיא הופכת לסמכותית",
          path: ["approvalState"],
        });
      }
    }
    // (c) a REJECTED-authority edge can never be approved.
    if (val.authority === "REJECTED" && val.approvalState === "approved") {
      ctx.addIssue({
        code: "custom",
        message: "קשת שנדחתה (REJECTED) לא יכולה להיות 'approved'",
        path: ["approvalState"],
      });
    }
    // no cross-organization edge: source.org === target.org === edge.org.
    let sourceOrg: string | null = null;
    let targetOrg: string | null = null;
    try {
      sourceOrg = parseNodeId(val.source).organizationId;
    } catch {
      ctx.addIssue({ code: "custom", message: "מזהה מקור לא תקין", path: ["source"] });
    }
    try {
      targetOrg = parseNodeId(val.target).organizationId;
    } catch {
      ctx.addIssue({ code: "custom", message: "מזהה יעד לא תקין", path: ["target"] });
    }
    if (sourceOrg !== null && targetOrg !== null) {
      if (sourceOrg !== targetOrg) {
        ctx.addIssue({
          code: "custom",
          message: `מעבר בין ארגונים אסור — מקור (${sourceOrg}) ויעד (${targetOrg}) אינם באותו ארגון`,
          path: ["target"],
        });
      } else if (sourceOrg !== val.organizationId) {
        ctx.addIssue({
          code: "custom",
          message: `ארגון הקשת (${val.organizationId}) אינו תואם את ארגון הצמתים (${sourceOrg})`,
          path: ["organizationId"],
        });
      }
    }
  });
