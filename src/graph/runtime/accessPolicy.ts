// TERAGON Business Graph — Phase 10 RUNTIME access policy.
// ---------------------------------------------------------------------------
// A SECOND guard beyond the build flag. `evaluate(...)` returns EXACTLY ONE
// decision. `ENABLED` requires ALL of:
//   • the facade feature is enabled, AND
//   • a trusted authenticated identity resolves, AND
//   • the role has a mapped graph capability (for the requested query, if any), AND
//   • the caller's organization context matches the resolved organization, AND
//   • the graph health is supported (when health is supplied), AND
//   • the internal rollout is approved.
// The rollout defaults to NOT approved, so `ENABLED` is impossible in production
// even with the flags forced on — and the production identity source yields no
// trusted identity anyway. Development mode does NOT enable access.
import type { GraphIndexHealthState } from "../store/contracts";
import type {
  BusinessGraphResolvedIdentity,
  BusinessGraphSessionIdentity,
} from "../application/types";
import type { BusinessGraphFeaturePolicy } from "../application/flag";
import type { BusinessQueryName } from "../query/types";
import { roleMayRunQuery } from "./authorizationMap";
import type {
  RuntimeBusinessGraphIdentityResolver,
  RuntimeIdentityDenialReason,
} from "./identity";
import type { BusinessGraphRuntimeRolloutPolicy } from "./rollout";

// ---------------------------------------------------------------------------
// decisions
// ---------------------------------------------------------------------------

export const RUNTIME_ACCESS_DECISIONS = [
  "ENABLED",
  "FEATURE_DISABLED",
  "IDENTITY_UNAVAILABLE",
  "ROLE_UNMAPPED",
  "CAPABILITY_DENIED",
  "ORGANIZATION_UNRESOLVED",
  "GRAPH_UNAVAILABLE",
  "ROLLOUT_NOT_APPROVED",
] as const;
export type RuntimeAccessDecision = (typeof RUNTIME_ACCESS_DECISIONS)[number];

/** The health states under which the graph is servable at all. */
const SUPPORTED_HEALTH_STATES: readonly GraphIndexHealthState[] = ["HEALTHY", "STALE", "DEGRADED"];

const REASONS_HE: Record<RuntimeAccessDecision, string> = {
  ENABLED: "גישת גרף מאושרת",
  FEATURE_DISABLED: "יכולת גרף העסקי מכובה",
  IDENTITY_UNAVAILABLE: "אין זהות מאומתת אמינה — הגישה נדחתה",
  ROLE_UNMAPPED: "לתפקיד אין מיפוי גישה לגרף",
  CAPABILITY_DENIED: "אין לתפקיד יכולת גרף לפעולה המבוקשת",
  ORGANIZATION_UNRESOLVED: "הקשר הארגון אינו תואם את הזהות המאומתת",
  GRAPH_UNAVAILABLE: "אינדקס הגרף אינו זמין",
  ROLLOUT_NOT_APPROVED: "פריסת הגרף הפנימית טרם אושרה",
};

// ---------------------------------------------------------------------------
// input / output
// ---------------------------------------------------------------------------

export interface RuntimeAccessPolicyInput {
  sessionIdentity: BusinessGraphSessionIdentity;
  /** the org context the caller believes it operates in; must match the resolved org */
  requestedOrganizationId?: string | null;
  /** a specific business query the caller intends to run (capability check) */
  requiredQuery?: BusinessQueryName;
  /**
   * The graph health when known. When the key is OMITTED the health gate is
   * deferred to the facade (which reports GRAPH_MISSING/GRAPH_UNHEALTHY itself);
   * when present (including `null`) the gate is applied.
   */
  graphHealth?: GraphIndexHealthState | null;
}

export interface RuntimeAccessEvaluation {
  decision: RuntimeAccessDecision;
  /** the trusted resolved identity — present ONLY when the decision is ENABLED */
  identity: BusinessGraphResolvedIdentity | null;
  reasonHe: string;
}

// ---------------------------------------------------------------------------
// policy
// ---------------------------------------------------------------------------

export interface RuntimeAccessPolicyDeps {
  featurePolicy: BusinessGraphFeaturePolicy;
  rolloutPolicy: BusinessGraphRuntimeRolloutPolicy;
  identityResolver: RuntimeBusinessGraphIdentityResolver;
}

/** Map a resolver denial reason onto the access decision surface. */
function decisionForDenial(
  reason: RuntimeIdentityDenialReason,
): Exclude<RuntimeAccessDecision, "ENABLED"> {
  switch (reason) {
    case "ORGANIZATION_UNRESOLVED":
      return "ORGANIZATION_UNRESOLVED";
    case "ROLE_UNMAPPED":
      return "ROLE_UNMAPPED";
    case "CAPABILITY_DENIED":
      return "CAPABILITY_DENIED";
    default:
      return "IDENTITY_UNAVAILABLE";
  }
}

export class BusinessGraphRuntimeAccessPolicy {
  private readonly featurePolicy: BusinessGraphFeaturePolicy;
  private readonly rolloutPolicy: BusinessGraphRuntimeRolloutPolicy;
  private readonly identityResolver: RuntimeBusinessGraphIdentityResolver;

  constructor(deps: RuntimeAccessPolicyDeps) {
    this.featurePolicy = deps.featurePolicy;
    this.rolloutPolicy = deps.rolloutPolicy;
    this.identityResolver = deps.identityResolver;
  }

  /** Evaluate the closed decision. Returns exactly one decision + a safe reason. */
  evaluate(input: RuntimeAccessPolicyInput): RuntimeAccessEvaluation {
    // (1) build flag — OFF ⇒ nothing else matters.
    if (!this.featurePolicy.isEnabled()) return this.deny("FEATURE_DISABLED");

    // (2) internal rollout approval — default NOT approved (dev mode never approves).
    if (!this.rolloutPolicy.isApproved()) return this.deny("ROLLOUT_NOT_APPROVED");

    // (3) trusted identity — deny-by-default, richer than the facade's two reasons.
    const resolution = this.identityResolver.resolveDetailed(input.sessionIdentity);
    if (!resolution.ok) return this.deny(decisionForDenial(resolution.reason));
    const identity = resolution.identity;

    // (4) same-organization context — the request may NOT name a different org.
    if (
      input.requestedOrganizationId !== undefined &&
      input.requestedOrganizationId !== null &&
      input.requestedOrganizationId !== identity.organizationId
    ) {
      return this.deny("ORGANIZATION_UNRESOLVED");
    }

    // (5) mapped graph capability for the specific requested query (when given).
    if (
      input.requiredQuery !== undefined &&
      !(identity.role !== undefined && roleMayRunQuery(identity.role, input.requiredQuery))
    ) {
      return this.deny("CAPABILITY_DENIED");
    }

    // (6) supported graph health (applied only when health is supplied).
    if (input.graphHealth !== undefined) {
      const health = input.graphHealth;
      if (health === null || !SUPPORTED_HEALTH_STATES.includes(health)) {
        return this.deny("GRAPH_UNAVAILABLE");
      }
    }

    return { decision: "ENABLED", identity, reasonHe: REASONS_HE.ENABLED };
  }

  private deny(decision: Exclude<RuntimeAccessDecision, "ENABLED">): RuntimeAccessEvaluation {
    return { decision, identity: null, reasonHe: REASONS_HE[decision] };
  }
}
