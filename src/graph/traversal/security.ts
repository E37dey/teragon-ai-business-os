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
import {
  edgeIsAuthoritative,
  type BusinessGraphEdge,
  type GraphRelationshipType,
} from "../contracts/edge";
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

// ---------------------------------------------------------------------------
// centralized edge access (Phase 6.1) — a single deny-by-default edge gate
// ---------------------------------------------------------------------------

/**
 * The relationship types whose edge requires an explicit human APPROVAL before it
 * may be treated as an authoritative traversal hop. These mirror the domain's
 * approval-gated relationships ("AI proposes, a named human approves"): an edge of
 * one of these types whose `approvalState !== "approved"` is denied by default.
 * A CLOSED constant — never caller-supplied.
 */
export const APPROVAL_REQUIRED_RELATIONSHIPS: ReadonlySet<GraphRelationshipType> =
  new Set<GraphRelationshipType>(["APPROVED_BY", "REJECTED_BY"]);

/** Does an edge of this relationship type require an explicit approval to traverse? */
export function relationshipRequiresApproval(rt: GraphRelationshipType): boolean {
  return APPROVAL_REQUIRED_RELATIONSHIPS.has(rt);
}

export interface EdgeAccessOptions {
  /** the resolved, applied traversal limits (relationship allow-list, etc.) */
  limits: GraphTraversalQueryLimits;
  /** the injected "as of" instant (ISO) for lifecycle validity, or null to skip */
  asOf: string | null;
  /** whether the caller holds an authorized STALE-graph grant (for STALE edges) */
  staleAccessAuthorized: boolean;
  /** allow historical (SUPERSEDED) endpoints + edges — lineage/timeline/conflict ops */
  allowHistorical?: boolean;
}

/**
 * Temporal lifecycle validity at the injected `asOf`. A `null` asOf means no
 * temporal reference is available (no injected clock and no `ctx.asOf`) — the
 * check is skipped (Phase-6 behavior). Otherwise a FUTURE-valid edge
 * (`validFrom > asOf`) or an EXPIRED edge (`validUntil <= asOf`) is denied. ISO-8601
 * timestamps compare correctly as strings, matching the ordering used elsewhere.
 */
function edgeTemporallyValid(edge: BusinessGraphEdge, asOf: string | null): boolean {
  if (asOf === null) return true;
  if (edge.validFrom > asOf) return false;
  if (edge.validUntil !== null && edge.validUntil <= asOf) return false;
  return true;
}

/**
 * Staleness policy for an edge's own `staleState`. BROKEN/UNRESOLVED are denied
 * unconditionally; SUPERSEDED is a lineage/historical state (only under
 * `allowHistorical`); STALE requires the caller's stale-access authorization
 * (see the health-level stale gate). FRESH is always permitted.
 */
function edgeStaleStateAllowed(edge: BusinessGraphEdge, options: EdgeAccessOptions): boolean {
  switch (edge.staleState) {
    case "FRESH":
      return true;
    case "SUPERSEDED":
      return options.allowHistorical === true;
    case "STALE":
      return options.staleAccessAuthorized === true;
    case "BROKEN":
    case "UNRESOLVED":
    default:
      return false;
  }
}

/**
 * The single, deny-by-default EDGE-visibility predicate. Deny-by-default: EVERY
 * clause must pass, and a hidden edge is INDISTINGUISHABLE from an absent one (the
 * caller turns both into the same skip). A visible node PAIR does NOT authorize the
 * edge between them — the edge is judged on its own facts.
 *
 * Clauses (all required):
 *   1. same organization — edge.org === ctx.org === viewer.org (cross-org denied);
 *   2. BOTH endpoints are `isNodeAccessible` (node-pair visibility ≠ edge grant);
 *   3. relationship-type + authority/provenance mode gate (`isEdgePermitted`):
 *      REJECTED always denied, INFERRED needs includeInferred, UNVERIFIED/PROPOSED
 *      need includeUnverified, and the relationship allow-list narrows further;
 *   4. edge sensitivity within viewer clearance;
 *   5. temporal lifecycle validity at `asOf` (future/expired edges denied);
 *   6. `staleState` policy (BROKEN/UNRESOLVED denied; SUPERSEDED historical-only;
 *      STALE only under an authorized stale grant);
 *   7. approval eligibility — an approval-required relationship whose edge is not
 *      `approved` is denied by default.
 */
export function isEdgeAccessible(
  edge: BusinessGraphEdge,
  sourceNode: BusinessGraphNode,
  targetNode: BusinessGraphNode,
  ctx: GraphQueryContext,
  options: EdgeAccessOptions,
): boolean {
  // (1) organization isolation — the edge, the query context, and the viewer agree.
  if (edge.organizationId !== ctx.organizationId) return false;
  if (ctx.organizationId !== ctx.viewer.organizationId) return false;
  // (2) both endpoints must be independently accessible.
  const nodeOptions = { allowHistorical: options.allowHistorical };
  if (!isNodeAccessible(sourceNode, ctx, nodeOptions)) return false;
  if (!isNodeAccessible(targetNode, ctx, nodeOptions)) return false;
  // (3) relationship allow-list + authority/provenance query-mode gate.
  if (!isEdgePermitted(edge, ctx, options.limits)) return false;
  // (4) edge sensitivity within clearance.
  if (!clearanceMeets(ctx.viewerClearance, edge.sensitivity)) return false;
  // (5) temporal lifecycle validity.
  if (!edgeTemporallyValid(edge, options.asOf)) return false;
  // (6) staleState policy.
  if (!edgeStaleStateAllowed(edge, options)) return false;
  // (7) approval eligibility.
  if (relationshipRequiresApproval(edge.relationshipType) && edge.approvalState !== "approved") {
    return false;
  }
  return true;
}
