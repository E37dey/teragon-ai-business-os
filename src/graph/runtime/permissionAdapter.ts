// TERAGON Business Graph — Phase 10 RUNTIME permission adapter.
// ---------------------------------------------------------------------------
// Translates the explicit closed role→graph mapping into the Phase-8
// `GraphPermissionOracle` the traversal layer consults. It is DENY-BY-DEFAULT:
// a resolved identity whose role has NO graph capability (unmapped / ineligible)
// gets an oracle that hides EVERYTHING. It fabricates NO permissions of its own
// and rewrites NO product authorization — clearance/sensitivity/authority/approval
// gates remain the traversal layer's job (fed by the resolved viewerClearance).
import type { GraphEntityType } from "../contracts/identity";
import type { BusinessGraphNode } from "../contracts/node";
import type { GraphViewerContext } from "../contracts/security";
import type { GraphIndexHealthState } from "../store/contracts";
import type { GraphPermissionOracle } from "../traversal/types";
import type {
  BusinessGraphPermissionAdapter,
  BusinessGraphResolvedIdentity,
} from "../application/types";
import { graphCapabilityForRole } from "./authorizationMap";

/** An oracle that denies every read/domain/stale question (deny-by-default). */
const DENY_ALL_ORACLE: GraphPermissionOracle = {
  canReadEntity: () => false,
  agentDomainAllowed: () => false,
  canUseStaleGraph: () => false,
};

/**
 * Builds a deny-by-default oracle from the resolved identity's role via the closed
 * runtime mapping. It re-derives the readable entity domains + stale grant from the
 * mapping (not just from the identity), so even a malformed identity handed to it
 * is denied unless its role is explicitly graph-capable.
 */
export class RuntimeBusinessGraphPermissionAdapter implements BusinessGraphPermissionAdapter {
  buildOracle(identity: BusinessGraphResolvedIdentity): GraphPermissionOracle {
    const role = identity.role;
    const capability = role === undefined ? null : graphCapabilityForRole(role);
    if (capability === null) return DENY_ALL_ORACLE;

    const domains = capability.domains;
    const inDomain = (entityType: GraphEntityType): boolean =>
      domains === null || domains.includes(entityType);
    const allowStale = capability.allowStaleGraph;

    return {
      canReadEntity: (
        _viewer: GraphViewerContext,
        entityType: GraphEntityType,
        _node: BusinessGraphNode,
      ): boolean => inDomain(entityType),
      agentDomainAllowed: (
        _viewer: GraphViewerContext,
        entityType: GraphEntityType,
        _node: BusinessGraphNode,
      ): boolean => inDomain(entityType),
      canUseStaleGraph: (_viewer: GraphViewerContext, _health: GraphIndexHealthState): boolean =>
        allowStale,
    };
  }
}
