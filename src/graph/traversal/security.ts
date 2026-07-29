// TERAGON Business Graph — per-hop security (Phase 6, deny-by-default).
// The gates enforced at the START node AND at EVERY traversed node/edge:
//   • same organization (never cross-org),
//   • viewer entity permission (injected oracle),
//   • agent domain window (injected oracle),
//   • sensitivity clearance,
//   • lifecycle eligibility (archived/superseded excluded for authoritative
//     results; historical allowed only for lineage ops),
//   • edge authority policy (edgeIsAuthoritative) + provenance query-mode gate.
// CONNECTION NEVER GRANTS VISIBILITY: an inaccessible node is skipped entirely —
// never traversed THROUGH — so it cannot leak via path shape, title, or count.
import { SENSITIVITY_ORDER } from "@/domain/memory/types";
import { edgeIsAuthoritative, type BusinessGraphEdge } from "../contracts/edge";
import type { BusinessGraphNode, GraphSensitivity } from "../contracts/node";
import type { GraphQueryContext, GraphTraversalQueryLimits } from "./types";

/** Does the viewer's clearance meet (≥) the node's sensitivity level? */
export function clearanceMeets(
  clearance: GraphSensitivity,
  sensitivity: GraphSensitivity,
): boolean {
  return SENSITIVITY_ORDER[clearance] >= SENSITIVITY_ORDER[sensitivity];
}

export interface NodeAccessOptions {
  /** allow archived/superseded nodes (lineage/timeline/conflict ops only) */
  allowHistorical?: boolean;
}

/**
 * The single node-visibility predicate. Deny-by-default: EVERY clause must pass.
 * Returns a plain boolean so an unauthorized node is INDISTINGUISHABLE from an
 * absent one (the caller turns both into the same refusal / same skip).
 */
export function isNodeAccessible(
  node: BusinessGraphNode,
  ctx: GraphQueryContext,
  options: NodeAccessOptions = {},
): boolean {
  // organization isolation — the node, the query context, and the viewer must all agree.
  if (node.organizationId !== ctx.organizationId) return false;
  if (ctx.viewer.organizationId !== ctx.organizationId) return false;
  // sensitivity clearance.
  if (!clearanceMeets(ctx.viewerClearance, node.sensitivity)) return false;
  // viewer entity permission + agent domain window (injected, deny-by-default).
  if (!ctx.permissions.canReadEntity(ctx.viewer, node.entityType, node)) return false;
  if (!ctx.permissions.agentDomainAllowed(ctx.viewer, node.entityType, node)) return false;
  // lifecycle eligibility.
  if (node.archived) return false;
  if (node.superseded && options.allowHistorical !== true) return false;
  return true;
}

export type EdgeTraversalClass = "AUTHORITATIVE" | "INFERRED" | "NON_AUTHORITATIVE";

/**
 * Classify an edge for traversal:
 *   • AUTHORITATIVE — authoritative AND provenance EXPLICIT/FOREIGN_KEY_DERIVED;
 *   • INFERRED — authoritative but INFERRED provenance (needs includeInferred);
 *   • NON_AUTHORITATIVE — UNVERIFIED/PROPOSED/REJECTED (needs includeUnverified,
 *     and REJECTED is refused unconditionally elsewhere).
 */
export function classifyEdge(edge: BusinessGraphEdge): EdgeTraversalClass {
  if (!edgeIsAuthoritative(edge)) return "NON_AUTHORITATIVE";
  if (edge.provenance === "INFERRED") return "INFERRED";
  return "AUTHORITATIVE";
}

/**
 * Deny-by-default edge gate. A REJECTED-authority edge is NEVER traversable
 * (terminal denial). INFERRED requires an explicit query mode; UNVERIFIED/PROPOSED
 * require an explicit query mode; both stay visibly labelled in the result.
 * The relationship-type allow-list narrows further.
 */
export function isEdgePermitted(
  edge: BusinessGraphEdge,
  ctx: GraphQueryContext,
  limits: GraphTraversalQueryLimits,
): boolean {
  if (
    limits.allowedRelationshipTypes &&
    !limits.allowedRelationshipTypes.includes(edge.relationshipType)
  ) {
    return false;
  }
  // a rejected edge is an explicit denial — never a valid hop.
  if (edge.authority === "REJECTED") return false;
  const cls = classifyEdge(edge);
  if (cls === "AUTHORITATIVE") return true;
  if (cls === "INFERRED") return ctx.includeInferred === true;
  return ctx.includeUnverified === true;
}
