// TERAGON Business Graph — Phase 6 traversal test helpers.
// A real ACTIVE snapshot derived from the valid fixture (via the real store),
// a controllable stub store (arbitrary health + org-scoped snapshot), synthetic
// snapshot builders for edge-mode / hidden-node cases, and permission oracles.
import {
  buildNodeId,
  rebuildOrganizationGraph,
  toGraphEdgeId,
  type BusinessGraphEdge,
  type BusinessGraphNode,
  type GraphEntityType,
  type GraphIndexHealth,
  type GraphIndexHealthState,
  type GraphIndexSnapshot,
  type GraphPermissionOracle,
  type GraphQueryContext,
  type GraphRelationshipType,
  type GraphSensitivity,
  type TraversalStore,
} from "@/graph";
import { VALID_CONTEXT, VALID_ORG, buildValidRecords } from "../fixtures/validFixture";
import { freshStore, makeClock } from "../store/helpers";

export const T0 = "2026-07-01T09:00:00.000Z";
export const T1 = "2026-07-02T09:00:00.000Z";

/** Derive + activate the valid fixture through the REAL store, return the ACTIVE snapshot. */
export async function deriveValidSnapshot(): Promise<GraphIndexSnapshot> {
  const store = freshStore();
  await rebuildOrganizationGraph(buildValidRecords(), VALID_CONTEXT, store, { now: makeClock() });
  const snap = await store.getActiveSnapshot(VALID_CONTEXT.organizationId);
  if (snap === null) throw new Error("fixture failed to activate");
  return snap;
}

/** Canonical node id in the fixture org. */
export function nid(entityType: GraphEntityType, entityId: string, org = VALID_ORG): string {
  return buildNodeId({ organizationId: org, entityType, entityId });
}

// ---------------------------------------------------------------------------
// controllable stub store (read-only surface only)
// ---------------------------------------------------------------------------

export function makeHealth(
  state: GraphIndexHealthState,
  activeSnapshotId: string | null,
  organizationId = VALID_ORG,
): GraphIndexHealth {
  return {
    organizationId,
    state,
    checkedAt: T0,
    activeSnapshotId,
    checksumVerified: state === "HEALTHY" || state === "STALE" || state === "DEGRADED",
    findings: [],
  };
}

export class StubStore implements TraversalStore {
  private readonly snapshot: GraphIndexSnapshot | null;
  private readonly health: GraphIndexHealth;

  constructor(snapshot: GraphIndexSnapshot | null, health: GraphIndexHealth) {
    this.snapshot = snapshot;
    this.health = health;
  }

  getActiveSnapshot(organizationId: string): Promise<GraphIndexSnapshot | null> {
    if (this.snapshot !== null && this.snapshot.organizationId === organizationId) {
      return Promise.resolve(this.snapshot);
    }
    return Promise.resolve(null);
  }

  getHealth(organizationId: string): Promise<GraphIndexHealth> {
    return Promise.resolve({ ...this.health, organizationId });
  }
}

/** A HEALTHY stub bound to `snap`. */
export function healthyStore(snap: GraphIndexSnapshot): StubStore {
  return new StubStore(snap, makeHealth("HEALTHY", snap.snapshotId, snap.organizationId));
}

/** A stub in an arbitrary health state serving `snap`. */
export function storeWithHealth(snap: GraphIndexSnapshot, state: GraphIndexHealthState): StubStore {
  return new StubStore(snap, makeHealth(state, snap.snapshotId, snap.organizationId));
}

// ---------------------------------------------------------------------------
// permission oracles
// ---------------------------------------------------------------------------

export const ALLOW_ALL: GraphPermissionOracle = {
  canReadEntity: () => true,
  agentDomainAllowed: () => true,
};

export function denyEntityTypes(types: ReadonlySet<GraphEntityType>): GraphPermissionOracle {
  return {
    canReadEntity: (_v, t) => !types.has(t),
    agentDomainAllowed: () => true,
  };
}

export function denyNodeIds(ids: ReadonlySet<string>): GraphPermissionOracle {
  return {
    canReadEntity: (_v, _t, node) => !ids.has(node.id),
    agentDomainAllowed: () => true,
  };
}

export function agentBanDomains(banned: ReadonlySet<GraphEntityType>): GraphPermissionOracle {
  return {
    canReadEntity: () => true,
    agentDomainAllowed: (_v, t) => !banned.has(t),
  };
}

// ---------------------------------------------------------------------------
// query context
// ---------------------------------------------------------------------------

export function ctxFor(over: Partial<GraphQueryContext> = {}): GraphQueryContext {
  return {
    organizationId: VALID_ORG,
    viewer: {
      organizationId: VALID_ORG,
      actor: { kind: "HUMAN", userId: "u-tzachi" },
      role: "ceo",
    },
    viewerClearance: "מוגבל",
    permissions: ALLOW_ALL,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// synthetic snapshot builder (for edge-mode / hidden-node / cycle cases)
// ---------------------------------------------------------------------------

export function synthNode(
  entityType: GraphEntityType,
  entityId: string,
  over: Partial<BusinessGraphNode> = {},
): BusinessGraphNode {
  const id = buildNodeId({ organizationId: VALID_ORG, entityType, entityId }) as BusinessGraphNode["id"];
  return {
    id,
    organizationId: VALID_ORG,
    entityType,
    entityId,
    title: `${entityType}:${entityId}`,
    status: null,
    sensitivity: "פנימי",
    ownerRef: null,
    version: null,
    authoritative: true,
    archived: false,
    superseded: false,
    createdAt: T0,
    updatedAt: T0,
    metadataSummary: {},
    ...over,
  };
}

export function synthEdge(
  relationshipType: GraphRelationshipType,
  source: BusinessGraphNode,
  target: BusinessGraphNode,
  over: Partial<BusinessGraphEdge> = {},
): BusinessGraphEdge {
  return {
    id: toGraphEdgeId(`e-${relationshipType}-${source.entityId}-${target.entityId}`),
    organizationId: VALID_ORG,
    relationshipType,
    source: source.id,
    target: target.id,
    direction: "directed",
    provenance: "EXPLICIT",
    authority: "CANONICAL",
    evidenceRefs: [],
    sensitivity: "פנימי" as GraphSensitivity,
    approvalState: "none",
    validFrom: T0,
    validUntil: null,
    createdAt: T0,
    createdBy: null,
    version: 1,
    staleState: "FRESH",
    ...over,
  };
}

export function synthSnapshot(
  nodes: BusinessGraphNode[],
  edges: BusinessGraphEdge[],
  organizationId = VALID_ORG,
): GraphIndexSnapshot {
  return {
    snapshotId: `idx-${organizationId}-synthetic`,
    organizationId,
    createdAt: T0,
    sourceSnapshotVersion: "synthetic",
    sourceHash: "synthetic-source-hash",
    registryVersion: "core-v1",
    schemaVersion: "graph-index-v2",
    derivationVersion: "phase-3",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    issueCounts: { error: 0, warning: 0, info: 0 },
    nodes,
    edges,
    issues: [],
    unmappableRecords: [],
    validationState: "VALID",
    buildState: "ACTIVE",
    activatedAt: T0,
    supersedesSnapshotId: null,
    checksum: "synthetic-checksum",
    checksumAlgorithm: "SHA-256",
    checksumVersion: 1,
  };
}
