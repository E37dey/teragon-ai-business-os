// TERAGON Business Graph — Phase 10 RUNTIME authorization mapping.
// ---------------------------------------------------------------------------
// The EXPLICIT, CLOSED mapping from each canonical role → its graph permissions:
// graph eligibility, readable entity domains, sensitivity clearance ceiling, the
// permitted business queries (a subset of the 9), stale-graph access, historical
// / superseded access, and evidence-path access. It is DENY-BY-DEFAULT: a role
// that is not graph-eligible (or a role id that is not one of the canonical 9)
// receives NOTHING.
//
// It does NOT rewrite the product authorization system — it IMPORTS the frozen
// role→permission matrix (`can`) and the canonical `PERMISSIONS`, and derives the
// permitted business queries from them. Graph access is an EXPLICITLY elevated
// capability: a role that can merely open a CRM screen (`customer.read`) does NOT
// thereby get graph intelligence — `graphEligible` is an explicit closed decision,
// never implied by CRM read.
import { can } from "@/authorization/matrix";
import type { Permission } from "@/authorization/permissions";
import {
  CANONICAL_ROLE_IDS,
  type CanonicalRoleId,
} from "@/domain/administration/types";
import type { GraphEntityType } from "../contracts/identity";
import type { GraphSensitivity } from "../contracts/node";
import { BUSINESS_QUERY_NAMES, type BusinessQueryName } from "../query/types";

// ---------------------------------------------------------------------------
// per-query product-permission requirement (derived, NOT re-implemented)
// ---------------------------------------------------------------------------

/**
 * Each of the 9 business queries maps to the ONE product permission a role must
 * already hold (in the frozen W9-B matrix) for that query's data to be visible.
 * This grounds the query set in the real authorization system rather than
 * inventing a parallel one.
 */
export const RUNTIME_QUERY_REQUIRED_PERMISSION: Readonly<Record<BusinessQueryName, Permission>> = {
  findCustomersNeedingFollowUp: "customer.read",
  findUnansweredQuotations: "sales.read",
  findRecurringServiceIssues: "service.read",
  findDelayedEnrollments: "course.manage",
  assessPrinterModelSupportImpact: "service.read",
  findSupersededEvidence: "knowledge.review",
  findRecommendationConflicts: "governance.review",
  findTasksFromApprovedRecommendations: "automation.approve",
  buildFullEvidencePath: "audit.read",
};

/** The query that IS the historical/superseded-evidence capability. */
const HISTORICAL_QUERIES: readonly BusinessQueryName[] = ["findSupersededEvidence"];
/** The query that IS the full evidence-path capability. */
const EVIDENCE_PATH_QUERIES: readonly BusinessQueryName[] = ["buildFullEvidencePath"];

// ---------------------------------------------------------------------------
// the explicit closed role → graph grant
// ---------------------------------------------------------------------------

/**
 * The explicit graph grant for a canonical role. `graphEligible` is the elevated
 * gate (deny-by-default): only an eligible role gets any graph capability at all.
 * `domains === null` means "no domain narrowing" (the whole readable universe);
 * a list narrows visibility to exactly those entity domains.
 */
export interface RuntimeGraphRoleGrant {
  readonly graphEligible: boolean;
  readonly clearanceCeiling: GraphSensitivity;
  readonly domains: readonly GraphEntityType[] | null;
  readonly stale: boolean;
  readonly historical: boolean;
  readonly evidence: boolean;
}

const DENY_GRANT: RuntimeGraphRoleGrant = {
  graphEligible: false,
  clearanceCeiling: "ציבורי",
  domains: [],
  stale: false,
  historical: false,
  evidence: false,
};

/**
 * The CLOSED table. Every one of the 9 canonical roles has an explicit entry.
 * `crole-viewer` is deliberately NOT graph-eligible — it can open business
 * screens (crm:read) but is denied the cross-entity graph, proving graph access
 * is never implied by mere CRM read.
 */
export const RUNTIME_GRAPH_ROLE_GRANTS: Readonly<Record<CanonicalRoleId, RuntimeGraphRoleGrant>> =
  Object.freeze({
    "crole-sysadmin": {
      graphEligible: true,
      clearanceCeiling: "מוגבל",
      domains: null,
      stale: true,
      historical: true,
      evidence: true,
    },
    "crole-ceo": {
      graphEligible: true,
      clearanceCeiling: "מוגבל",
      domains: null,
      stale: true,
      historical: true,
      evidence: true,
    },
    "crole-bizmgr": {
      graphEligible: true,
      clearanceCeiling: "רגיש",
      domains: [
        "customer", "contact", "lead", "opportunity", "quotation", "product",
        "printerModel", "customerPrinter", "serviceTicket", "repairAction",
        "course", "student", "enrollment", "task", "aiRecommendation",
        "approval", "knowledgeArticle", "agent", "agentRun",
      ],
      stale: false,
      historical: true,
      evidence: false,
    },
    "crole-sales": {
      graphEligible: true,
      clearanceCeiling: "פנימי",
      domains: [
        "customer", "contact", "lead", "opportunity", "quotation", "product",
        "printerModel", "customerPrinter", "serviceTicket", "task", "aiRecommendation",
      ],
      stale: false,
      historical: false,
      evidence: false,
    },
    "crole-service": {
      graphEligible: true,
      clearanceCeiling: "רגיש",
      domains: [
        "customer", "contact", "serviceTicket", "repairAction", "customerPrinter",
        "printerModel", "product", "task", "knowledgeArticle", "aiRecommendation",
      ],
      stale: false,
      historical: false,
      evidence: false,
    },
    "crole-instructor": {
      graphEligible: true,
      clearanceCeiling: "פנימי",
      domains: ["customer", "course", "student", "enrollment", "task", "knowledgeArticle"],
      stale: false,
      historical: false,
      evidence: false,
    },
    "crole-champion": {
      graphEligible: true,
      clearanceCeiling: "פנימי",
      domains: [
        "customer", "lead", "opportunity", "quotation", "serviceTicket", "course",
        "enrollment", "knowledgeArticle", "aiRecommendation", "task",
        "learningProposal", "learningObservation",
      ],
      stale: false,
      historical: true,
      evidence: false,
    },
    "crole-auditor": {
      graphEligible: true,
      clearanceCeiling: "מוגבל",
      domains: null,
      stale: true,
      historical: true,
      evidence: true,
    },
    "crole-viewer": DENY_GRANT,
  });

// ---------------------------------------------------------------------------
// the resolved graph capability for a role
// ---------------------------------------------------------------------------

/** The fully-resolved graph capability of a canonical role (deny-by-default). */
export interface RuntimeGraphRoleCapability {
  roleId: CanonicalRoleId;
  clearanceCeiling: GraphSensitivity;
  domains: readonly GraphEntityType[] | null;
  permittedQueries: readonly BusinessQueryName[];
  allowStaleGraph: boolean;
  allowHistorical: boolean;
  allowEvidencePath: boolean;
}

/** Type-guard: is `s` one of the 9 canonical role ids? */
export function isCanonicalRoleId(s: string): s is CanonicalRoleId {
  return (CANONICAL_ROLE_IDS as readonly string[]).includes(s);
}

/**
 * Resolve a role id into its graph capability, or `null` when the role has NO
 * graph access — either because the id is not one of the canonical 9, or because
 * the role is explicitly not graph-eligible (deny-by-default). The permitted
 * business queries are the intersection of (the role's held product permissions)
 * with (each query's required permission), further gated by the explicit
 * historical / evidence grants.
 */
export function graphCapabilityForRole(roleId: string): RuntimeGraphRoleCapability | null {
  if (!isCanonicalRoleId(roleId)) return null;
  const grant = RUNTIME_GRAPH_ROLE_GRANTS[roleId];
  if (!grant.graphEligible) return null;

  const permittedQueries = BUSINESS_QUERY_NAMES.filter((query) => {
    if (!can(roleId, RUNTIME_QUERY_REQUIRED_PERMISSION[query])) return false;
    if (HISTORICAL_QUERIES.includes(query) && !grant.historical) return false;
    if (EVIDENCE_PATH_QUERIES.includes(query) && !grant.evidence) return false;
    return true;
  });

  // A graph-eligible role with NO permitted query has, in effect, no graph
  // capability — deny-by-default rather than resolve an empty grant.
  if (permittedQueries.length === 0) return null;

  return {
    roleId,
    clearanceCeiling: grant.clearanceCeiling,
    domains: grant.domains,
    permittedQueries,
    allowStaleGraph: grant.stale,
    allowHistorical: grant.historical,
    allowEvidencePath: grant.evidence,
  };
}

/** Is `query` permitted for `roleId`? Deny-by-default (unmapped/ineligible ⇒ false). */
export function roleMayRunQuery(roleId: string, query: BusinessQueryName): boolean {
  const cap = graphCapabilityForRole(roleId);
  return cap !== null && cap.permittedQueries.includes(query);
}
