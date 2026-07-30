// TERAGON Business Graph — read-only traversal service (Phase 6).
// ---------------------------------------------------------------------------
// BusinessGraphTraversalService traverses the currently-served, validated ACTIVE
// snapshot (read via GraphIndexStore.getActiveSnapshot + getHealth). It is PURE /
// deterministic given a snapshot and NEVER mutates a snapshot, node, or edge.
// Every query: (1) health-gates, (2) enforces deny-by-default security at the
// start node AND every hop, (3) stays bounded + cycle-safe + stably ordered, and
// (4) emits a safe audit record. An unauthorized start node is INDISTINGUISHABLE
// from an absent one; hidden intermediates never leak via shape/title/count.
import type { BusinessGraphNode } from "../contracts/node";
import type { BusinessGraphEdge, GraphRelationshipType } from "../contracts/edge";
import type { GraphNodeId } from "../contracts/identity";
import type {
  GraphIndexHealthState,
  GraphIndexSnapshot,
  GraphIndexStore,
} from "../store/contracts";
import { compareEdges, comparePaths, compareStrings } from "./ordering";
import { isEdgeAccessible, isNodeAccessible } from "./security";
import {
  deriveRequestFingerprint,
  durationBucket,
  newExecutionId,
  protectSearchText,
} from "./audit";
import { resolveLimits } from "./limits";
import {
  graphQueryContextScalarsSchema,
  graphTraversalRequestSchema,
  type GraphConflict,
  type GraphEvidenceItem,
  type GraphImpactedNode,
  type GraphNeighborResult,
  type GraphNeighborView,
  type GraphPath,
  type GraphPathStep,
  type GraphQueryContext,
  type GraphQueryFilters,
  type GraphQueryResultCounts,
  type GraphSearchHit,
  type GraphSearchResult,
  type GraphTimelineEvent,
  type GraphTraversalData,
  type GraphTraversalOperation,
  type GraphTraversalQueryLimits,
  type GraphTraversalQueryLimitsInput,
  type GraphTraversalRequest,
  type GraphTraversalResult,
  type GraphTruncationState,
  type GraphConflictResult,
  type GraphEvidenceResult,
  type GraphImpactResult,
  type GraphTimelineResult,
} from "./types";

// ---------------------------------------------------------------------------
// the only store surface the service depends on (read-only)
// ---------------------------------------------------------------------------

export type TraversalStore = Pick<GraphIndexStore, "getActiveSnapshot" | "getHealth">;

export interface TraversalServiceOptions {
  /**
   * Monotonic millisecond source for the duration bucket. REQUIRED and injected —
   * there is NO hidden `Date.now()` fallback in the traversal layer.
   */
  now: () => number;
  /**
   * The wall-clock "as of" ISO clock used for edge lifecycle validity when a
   * request omits `ctx.asOf`. Injected (no hidden `Date.now()`); when neither this
   * nor `ctx.asOf` is present, temporal lifecycle gating is skipped.
   */
  asOf?: () => string;
  /**
   * Unique execution-id provider. Defaults to Web Crypto `randomUUID` (allowed —
   * not `Math.random`/`Date`); tests inject a deterministic counter. NEVER a key.
   */
  executionIdProvider?: () => string;
}

/**
 * The resolved per-query edge policy threaded through the traversal engine so
 * EVERY edge is judged by the same centralized `isEdgeAccessible` gate.
 */
interface EdgePolicy {
  limits: GraphTraversalQueryLimits;
  asOf: string | null;
  staleAccessAuthorized: boolean;
  allowHistorical: boolean;
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

interface GraphIndexView {
  nodeById: Map<string, BusinessGraphNode>;
  edgeById: Map<string, BusinessGraphEdge>;
  outByNode: Map<string, BusinessGraphEdge[]>;
  inByNode: Map<string, BusinessGraphEdge[]>;
}

interface Expansion {
  edge: BusinessGraphEdge;
  otherId: string;
  direction: "outbound" | "inbound";
}

interface FrontierNode {
  id: string;
  path: GraphPath;
}

const EVIDENCE_RELATIONSHIPS: ReadonlySet<GraphRelationshipType> = new Set<GraphRelationshipType>([
  "SUPPORTED_BY",
  "MENTIONED_IN",
  "AUDITS",
  "DERIVED_FROM",
]);

const CONFLICT_RELATIONSHIPS: ReadonlySet<GraphRelationshipType> = new Set<GraphRelationshipType>([
  "CONTRADICTS",
  "SUPERSEDES",
]);

function emptyTruncation(): GraphTruncationState {
  return {
    truncated: false,
    byDepth: false,
    byNodes: false,
    byEdges: false,
    byPaths: false,
    byTimeout: false,
  };
}

function emptyPath(startId: string): GraphPath {
  return { nodes: [startId as GraphNodeId], steps: [], length: 0 };
}

function toStep(edge: BusinessGraphEdge): GraphPathStep {
  return {
    edgeId: edge.id,
    relationshipType: edge.relationshipType,
    sourceId: edge.source,
    targetId: edge.target,
    provenance: edge.provenance,
    authority: edge.authority,
    direction: edge.direction,
  };
}

function extendPath(base: GraphPath, edge: BusinessGraphEdge, otherId: string): GraphPath {
  return {
    nodes: [...base.nodes, otherId as GraphNodeId],
    steps: [...base.steps, toStep(edge)],
    length: base.length + 1,
  };
}

// ---------------------------------------------------------------------------
// prepare outcome
// ---------------------------------------------------------------------------

interface PreparedCommon {
  appliedLimits: GraphTraversalQueryLimits;
  requestedLimits: GraphTraversalQueryLimitsInput | null;
  searchTextHash: string | null;
  searchTextClass: string | null;
  startNodeId: string | null;
  targetNodeId: string | null;
  /** true only when a STALE/DEGRADED snapshot was served under an authorized grant */
  staleAccessAuthorized: boolean;
}

interface PreparedOk extends PreparedCommon {
  kind: "ok";
  snapshot: GraphIndexSnapshot;
  health: GraphIndexHealthState;
  stale: boolean;
}

interface PreparedRefuse extends PreparedCommon {
  kind: "refuse";
  health: GraphIndexHealthState;
  snapshotId: string | null;
  registryVersion: string | null;
  stale: boolean;
  reason: string;
}

type Prepared = PreparedOk | PreparedRefuse;

/** Which operations require which node params. */
const REQUIRES_START: ReadonlySet<GraphTraversalOperation> = new Set<GraphTraversalOperation>([
  "getNode",
  "getNeighbors",
  "findPath",
  "findRelatedEvidence",
  "calculateImpact",
  "findConflicts",
  "getTimeline",
]);

function healthGate(state: GraphIndexHealthState): "REFUSE" | "DENY_STALE" | "OK" {
  switch (state) {
    case "CORRUPT":
    case "MISSING":
    case "REBUILD_REQUIRED":
      return "REFUSE";
    case "STALE":
    case "DEGRADED":
      return "DENY_STALE";
    case "HEALTHY":
      return "OK";
    default:
      return "REFUSE";
  }
}

export class BusinessGraphTraversalService {
  private readonly store: TraversalStore;
  private readonly now: () => number;
  private readonly asOfClock: (() => string) | undefined;
  private readonly executionIdProvider: () => string;

  constructor(store: TraversalStore, options: TraversalServiceOptions) {
    this.store = store;
    // NO hidden Date.now(): the millisecond source is injected by the caller.
    this.now = options.now;
    this.asOfClock = options.asOf;
    this.executionIdProvider = options.executionIdProvider ?? newExecutionId;
  }

  /** Resolve the "as of" instant: explicit request value, else injected clock, else null. */
  private resolveAsOf(ctx: GraphQueryContext): string | null {
    if (ctx.asOf !== undefined) return ctx.asOf;
    if (this.asOfClock !== undefined) return this.asOfClock();
    return null;
  }

  /** Build the per-query edge policy from a prepared OK outcome. */
  private policyFor(prep: PreparedOk, ctx: GraphQueryContext, allowHistorical: boolean): EdgePolicy {
    return {
      limits: prep.appliedLimits,
      asOf: this.resolveAsOf(ctx),
      staleAccessAuthorized: prep.staleAccessAuthorized,
      allowHistorical,
    };
  }

  // -------------------------------------------------------------------------
  // public operations
  // -------------------------------------------------------------------------

  async getNode(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<BusinessGraphNode>> {
    const started = this.now();
    const prep = await this.prepare("getNode", request, ctx);
    if (prep.kind === "refuse") return this.emit<BusinessGraphNode>(prep, ctx, "getNode", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const node = this.accessibleStart(index, prep.startNodeId, ctx);
    if (node === null) return this.emitOkRefuse(prep, ctx, "getNode", started);

    return this.emit(prep, ctx, "getNode", started, node, { nodes: 1, edges: 0, paths: 0 }, null);
  }

  async getNeighbors(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphNeighborResult>> {
    const started = this.now();
    const prep = await this.prepare("getNeighbors", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphNeighborResult>(prep, ctx, "getNeighbors", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx);
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "getNeighbors", started);

    const limits = prep.appliedLimits;
    const truncated = emptyTruncation();
    const policy = this.policyFor(prep, ctx, false);
    const expansions = this.expand(startNode.id, index, ctx, policy, "incident");
    const neighbors: GraphNeighborView[] = [];
    let edgeBudget = limits.maxEdges;
    for (const ex of expansions) {
      if (edgeBudget <= 0) {
        truncated.byEdges = truncated.truncated = true;
        break;
      }
      edgeBudget -= 1;
      if (neighbors.length >= limits.maxNodes) {
        truncated.byNodes = truncated.truncated = true;
        break;
      }
      const node = index.nodeById.get(ex.otherId)!;
      neighbors.push({ node, via: toStep(ex.edge), direction: ex.direction });
    }
    const data: GraphNeighborResult = { startNode, neighbors };
    return this.emit(prep, ctx, "getNeighbors", started, data, {
      nodes: neighbors.length,
      edges: neighbors.length,
      paths: 0,
    }, null, truncated);
  }

  async findPath(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<{ paths: GraphPath[] }>> {
    const started = this.now();
    const prep = await this.prepare("findPath", request, ctx);
    if (prep.kind === "refuse") return this.emit<{ paths: GraphPath[] }>(prep, ctx, "findPath", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx);
    // an inaccessible/absent START is indistinguishable from absent (refuse).
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "findPath", started);

    // an inaccessible/absent TARGET is indistinguishable from "no path" (empty).
    const targetId = prep.targetNodeId;
    const target = targetId ? index.nodeById.get(targetId) : undefined;
    const targetOk = target !== undefined && isNodeAccessible(target, ctx);

    const { paths, truncated } = targetOk && targetId
      ? this.shortestPaths(startNode.id, targetId, index, ctx, this.policyFor(prep, ctx, false))
      : { paths: [] as GraphPath[], truncated: emptyTruncation() };

    const uniqueNodes = new Set<string>();
    let steps = 0;
    for (const p of paths) {
      for (const n of p.nodes) uniqueNodes.add(n);
      steps += p.steps.length;
    }
    return this.emit(prep, ctx, "findPath", started, { paths }, {
      nodes: uniqueNodes.size,
      edges: steps,
      paths: paths.length,
    }, null, truncated);
  }

  async findRelatedEvidence(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphEvidenceResult>> {
    const started = this.now();
    const prep = await this.prepare("findRelatedEvidence", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphEvidenceResult>(prep, ctx, "findRelatedEvidence", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx);
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "findRelatedEvidence", started);

    const relFilter = (edge: BusinessGraphEdge): boolean =>
      EVIDENCE_RELATIONSHIPS.has(edge.relationshipType) || edge.evidenceRefs.length > 0;
    const { reached, truncated } = this.bfsShortest(
      startNode.id,
      index,
      ctx,
      this.policyFor(prep, ctx, false),
      "outbound",
      relFilter,
    );

    const evidence: GraphEvidenceItem[] = [];
    for (const [nodeId, hit] of reached) {
      if (nodeId === startNode.id) continue;
      const node = index.nodeById.get(nodeId)!;
      const lastStep = hit.path.steps[hit.path.steps.length - 1]!;
      const edge = index.edgeById.get(lastStep.edgeId)!;
      evidence.push({
        node,
        path: hit.path,
        provenance: lastStep.provenance,
        authority: lastStep.authority,
        evidenceRefs: [...edge.evidenceRefs],
      });
    }
    evidence.sort(
      (a, b) => comparePaths(a.path, b.path) || compareStrings(a.node.id, b.node.id),
    );
    const data: GraphEvidenceResult = { subjectNodeId: startNode.id, evidence };
    return this.emit(prep, ctx, "findRelatedEvidence", started, data, {
      nodes: evidence.length,
      edges: evidence.length,
      paths: evidence.length,
    }, null, truncated);
  }

  async calculateImpact(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphImpactResult>> {
    const started = this.now();
    const prep = await this.prepare("calculateImpact", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphImpactResult>(prep, ctx, "calculateImpact", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx);
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "calculateImpact", started);

    // Phase 9 — an "incident" impact walks edges in BOTH directions so an origin
    // reachable only through an INBOUND relationship (e.g. printerModel via the
    // customerPrinter→printerModel USES edge) still propagates. Default outbound.
    const mode: "outbound" | "incident" = request.impactDirection === "incident" ? "incident" : "outbound";
    const { reached, truncated } = this.bfsShortest(
      startNode.id,
      index,
      ctx,
      this.policyFor(prep, ctx, false),
      mode,
    );

    const direct: GraphImpactedNode[] = [];
    const indirect: GraphImpactedNode[] = [];
    for (const [nodeId, hit] of reached) {
      if (nodeId === startNode.id) continue;
      const node = index.nodeById.get(nodeId)!;
      const impacted: GraphImpactedNode = {
        node,
        distance: hit.distance,
        impact: hit.distance === 1 ? "DIRECT" : "INDIRECT",
        path: hit.path,
      };
      (hit.distance === 1 ? direct : indirect).push(impacted);
    }
    const order = (a: GraphImpactedNode, b: GraphImpactedNode): number =>
      comparePaths(a.path, b.path) || compareStrings(a.node.id, b.node.id);
    direct.sort(order);
    indirect.sort(order);
    const data: GraphImpactResult = { originNodeId: startNode.id, direct, indirect };
    return this.emit(prep, ctx, "calculateImpact", started, data, {
      nodes: direct.length + indirect.length,
      edges: direct.length + indirect.length,
      paths: direct.length + indirect.length,
    }, null, truncated);
  }

  async findConflicts(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphConflictResult>> {
    const started = this.now();
    const prep = await this.prepare("findConflicts", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphConflictResult>(prep, ctx, "findConflicts", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx);
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "findConflicts", started);

    // lineage/historical mode: SUPERSEDED endpoints + edges are valid for conflict
    // reporting; every edge still passes the single centralized access gate.
    const policy = this.policyFor(prep, ctx, true);
    const incident = [
      ...(index.outByNode.get(startNode.id) ?? []),
      ...(index.inByNode.get(startNode.id) ?? []),
    ];
    const seen = new Set<string>();
    const rows: BusinessGraphEdge[] = [];
    for (const edge of incident) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      // registered CONTRADICTS/SUPERSEDES relationships ONLY — no inference.
      if (!CONFLICT_RELATIONSHIPS.has(edge.relationshipType)) continue;
      rows.push(edge);
    }
    rows.sort(compareEdges);

    const conflicts: GraphConflict[] = [];
    for (const edge of rows) {
      const source = index.nodeById.get(edge.source);
      const target = index.nodeById.get(edge.target);
      if (!source || !target) continue;
      if (!isEdgeAccessible(edge, source, target, ctx, policy)) continue;
      const other = edge.source === startNode.id ? target : source;
      conflicts.push({
        kind: edge.relationshipType === "CONTRADICTS" ? "CONTRADICTS" : "SUPERSEDES",
        relationshipType: edge.relationshipType,
        edgeId: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        otherNode: other,
        authority: edge.authority,
        provenance: edge.provenance,
      });
    }
    const data: GraphConflictResult = { nodeId: startNode.id, conflicts };
    return this.emit(prep, ctx, "findConflicts", started, data, {
      nodes: conflicts.length,
      edges: conflicts.length,
      paths: 0,
    }, null);
  }

  async searchGraph(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphSearchResult>> {
    const started = this.now();
    const prep = await this.prepare("searchGraph", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphSearchResult>(prep, ctx, "searchGraph", started, null, zeroCounts(), null);

    const raw = (request.searchText ?? "").trim().toLowerCase();
    const limits = prep.appliedLimits;
    const truncated = emptyTruncation();
    const hits: GraphSearchHit[] = [];

    if (raw.length > 0) {
      // iterate a COPY — never sort the snapshot's own array (read-only).
      for (const node of [...prep.snapshot.nodes]) {
        if (!isNodeAccessible(node, ctx)) continue;
        if (
          limits.allowedEntityTypes &&
          !limits.allowedEntityTypes.includes(node.entityType)
        ) {
          continue;
        }
        const scored = scoreNode(node, raw);
        if (scored) hits.push({ node, score: scored.score, matchedField: scored.field });
      }
      hits.sort(
        (a, b) => b.score - a.score || compareStrings(a.node.id, b.node.id),
      );
      if (hits.length > limits.maxNodes) {
        hits.length = limits.maxNodes;
        truncated.byNodes = truncated.truncated = true;
      }
    }

    const data: GraphSearchResult = {
      query: { hash: prep.searchTextHash, classification: prep.searchTextClass },
      hits,
    };
    return this.emit(prep, ctx, "searchGraph", started, data, {
      nodes: hits.length,
      edges: 0,
      paths: 0,
    }, null, truncated);
  }

  async getTimeline(
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<GraphTraversalResult<GraphTimelineResult>> {
    const started = this.now();
    const prep = await this.prepare("getTimeline", request, ctx);
    if (prep.kind === "refuse") return this.emit<GraphTimelineResult>(prep, ctx, "getTimeline", started, null, zeroCounts(), null);

    const index = buildIndex(prep.snapshot);
    const startNode = this.accessibleStart(index, prep.startNodeId, ctx, { allowHistorical: true });
    if (startNode === null) return this.emitOkRefuse(prep, ctx, "getTimeline", started);

    const limits = prep.appliedLimits;
    const policy = this.policyFor(prep, ctx, true);
    const events: GraphTimelineEvent[] = [];
    events.push({
      at: startNode.createdAt,
      kind: "NODE_CREATED",
      nodeId: startNode.id,
      labelHe: "הצומת נוצר",
    });
    if (startNode.updatedAt !== startNode.createdAt) {
      events.push({
        at: startNode.updatedAt,
        kind: "NODE_UPDATED",
        nodeId: startNode.id,
        labelHe: "הצומת עודכן",
      });
    }

    const incident = [
      ...(index.outByNode.get(startNode.id) ?? []),
      ...(index.inByNode.get(startNode.id) ?? []),
    ];
    const seen = new Set<string>();
    let edgeBudget = limits.maxEdges;
    for (const edge of incident) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      if (edgeBudget <= 0) break;
      // only expose events for edges that pass the single centralized access gate
      // (both endpoints visible, authority/lifecycle/approval/stale honored).
      const source = index.nodeById.get(edge.source);
      const target = index.nodeById.get(edge.target);
      if (!source || !target) continue;
      if (!isEdgeAccessible(edge, source, target, ctx, policy)) continue;
      edgeBudget -= 1;
      events.push({
        at: edge.createdAt,
        kind: "EDGE_CREATED",
        edgeId: edge.id,
        relationshipType: edge.relationshipType,
        labelHe: `קשת ${edge.relationshipType} נוצרה`,
      });
      events.push({
        at: edge.validFrom,
        kind: "EDGE_VALID_FROM",
        edgeId: edge.id,
        relationshipType: edge.relationshipType,
        labelHe: `קשת ${edge.relationshipType} תקפה מ-`,
      });
      if (edge.validUntil !== null) {
        events.push({
          at: edge.validUntil,
          kind: "EDGE_VALID_UNTIL",
          edgeId: edge.id,
          relationshipType: edge.relationshipType,
          labelHe: `קשת ${edge.relationshipType} תקפה עד`,
        });
      }
    }

    events.sort(
      (a, b) =>
        compareStrings(a.at, b.at) ||
        compareStrings(a.kind, b.kind) ||
        compareStrings(a.edgeId ?? "", b.edgeId ?? ""),
    );
    const data: GraphTimelineResult = { nodeId: startNode.id, events };
    return this.emit(prep, ctx, "getTimeline", started, data, {
      nodes: 1,
      edges: events.filter((e) => e.edgeId !== undefined).length,
      paths: 0,
    }, null);
  }

  // -------------------------------------------------------------------------
  // prepare (validate → health-gate → load snapshot)
  // -------------------------------------------------------------------------

  private async prepare(
    operation: GraphTraversalOperation,
    request: GraphTraversalRequest,
    ctx: GraphQueryContext,
  ): Promise<Prepared> {
    const requestedLimits = request.limits ?? null;
    const appliedLimits = resolveLimits(request.limits);
    const search = await protectSearchText(request.searchText);
    const common: PreparedCommon = {
      appliedLimits,
      requestedLimits,
      searchTextHash: search.hash,
      searchTextClass: search.classification,
      startNodeId: null,
      targetNodeId: null,
      staleAccessAuthorized: false,
    };

    // (1) validate the context scalars + oracle presence + org agreement.
    const scalars = {
      organizationId: ctx.organizationId,
      viewer: ctx.viewer,
      viewerClearance: ctx.viewerClearance,
      ...(ctx.revealReason !== undefined ? { revealReason: ctx.revealReason } : {}),
      ...(ctx.allowStale !== undefined ? { allowStale: ctx.allowStale } : {}),
      ...(ctx.asOf !== undefined ? { asOf: ctx.asOf } : {}),
      ...(ctx.includeInferred !== undefined ? { includeInferred: ctx.includeInferred } : {}),
      ...(ctx.includeUnverified !== undefined ? { includeUnverified: ctx.includeUnverified } : {}),
      ...(ctx.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
    };
    const ctxOk = graphQueryContextScalarsSchema.safeParse(scalars).success;
    const oracleOk =
      typeof ctx.permissions?.canReadEntity === "function" &&
      typeof ctx.permissions?.agentDomainAllowed === "function" &&
      typeof ctx.permissions?.canUseStaleGraph === "function";
    if (!ctxOk || !oracleOk) {
      return { kind: "refuse", ...common, health: "MISSING", snapshotId: null, registryVersion: null, stale: false, reason: "INVALID_CONTEXT" };
    }
    if (ctx.organizationId !== ctx.viewer.organizationId) {
      return { kind: "refuse", ...common, health: "MISSING", snapshotId: null, registryVersion: null, stale: false, reason: "ORG_CONTEXT_MISMATCH" };
    }

    // (2) health gate BEFORE any snapshot read.
    const health = await this.store.getHealth(ctx.organizationId);
    const gate = healthGate(health.state);
    if (gate === "REFUSE") {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "GRAPH_UNAVAILABLE" };
    }
    // STALE/DEGRADED: `allowStale` is only a REQUEST. Serving stale data requires
    // ALL of — the request set allowStale, the actor is an internal HUMAN/SYSTEM
    // (never an AGENT), and the oracle explicitly grants it. Any miss ⇒ deny.
    if (gate === "DENY_STALE") {
      const staleAuthorized =
        ctx.allowStale === true &&
        ctx.viewer.actor.kind !== "AGENT" &&
        ctx.permissions.canUseStaleGraph(ctx.viewer, health.state);
      if (!staleAuthorized) {
        return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "STALE_NOT_AUTHORIZED" };
      }
    }

    // (3) validate the request shape + required node params.
    const parsed = graphTraversalRequestSchema.safeParse(request);
    if (!parsed.success || parsed.data.operation !== operation) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "INVALID_REQUEST" };
    }
    const startNodeId = parsed.data.startNodeId ?? null;
    const targetNodeId = parsed.data.targetNodeId ?? null;
    if (REQUIRES_START.has(operation) && startNodeId === null) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "INVALID_REQUEST" };
    }
    if (operation === "findPath" && targetNodeId === null) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "INVALID_REQUEST" };
    }
    if (operation === "searchGraph" && request.searchText === undefined) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "INVALID_REQUEST" };
    }

    // (4) load the served ACTIVE snapshot (org-scoped).
    const snapshot = await this.store.getActiveSnapshot(ctx.organizationId);
    if (snapshot === null) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: health.activeSnapshotId, registryVersion: null, stale: false, reason: "GRAPH_UNAVAILABLE" };
    }
    if (snapshot.organizationId !== ctx.organizationId) {
      return { kind: "refuse", ...common, health: health.state, snapshotId: snapshot.snapshotId, registryVersion: null, stale: false, reason: "ORG_CONTEXT_MISMATCH" };
    }

    return {
      kind: "ok",
      ...common,
      startNodeId,
      targetNodeId,
      snapshot,
      health: health.state,
      stale: gate === "DENY_STALE",
      staleAccessAuthorized: gate === "DENY_STALE",
    };
  }

  // -------------------------------------------------------------------------
  // start-node resolution (absent === forbidden — indistinguishable)
  // -------------------------------------------------------------------------

  private accessibleStart(
    index: GraphIndexView,
    startNodeId: string | null,
    ctx: GraphQueryContext,
    options: { allowHistorical?: boolean } = {},
  ): BusinessGraphNode | null {
    if (startNodeId === null) return null;
    const node = index.nodeById.get(startNodeId);
    if (node === undefined) return null;
    if (!isNodeAccessible(node, ctx, options)) return null;
    return node;
  }

  // -------------------------------------------------------------------------
  // expansion + BFS (deterministic, bounded, cycle-safe, hidden-node-safe)
  // -------------------------------------------------------------------------

  private expand(
    nid: string,
    index: GraphIndexView,
    ctx: GraphQueryContext,
    policy: EdgePolicy,
    mode: "outbound" | "incident",
    relFilter?: (edge: BusinessGraphEdge) => boolean,
  ): Expansion[] {
    const raw: Expansion[] = [];
    for (const edge of index.outByNode.get(nid) ?? []) {
      raw.push({ edge, otherId: edge.target, direction: "outbound" });
    }
    for (const edge of index.inByNode.get(nid) ?? []) {
      if (mode === "incident") {
        raw.push({ edge, otherId: edge.source, direction: "inbound" });
      } else if (edge.direction === "bidirectional") {
        // outbound traversal may still follow a bidirectional edge backwards.
        raw.push({ edge, otherId: edge.source, direction: "outbound" });
      }
    }
    const limits = policy.limits;
    const out: Expansion[] = [];
    for (const ex of raw) {
      if (relFilter && !relFilter(ex.edge)) continue;
      // EVERY edge is judged by the single centralized gate — node visibility
      // alone never authorizes an edge, and a hidden edge is skipped like an
      // absent one (no leak via path shape/count).
      const sourceNode = index.nodeById.get(ex.edge.source);
      const targetNode = index.nodeById.get(ex.edge.target);
      if (sourceNode === undefined || targetNode === undefined) continue;
      if (!isEdgeAccessible(ex.edge, sourceNode, targetNode, ctx, policy)) continue;
      // caller entity-type allow-list on the node we traverse TO.
      const other = index.nodeById.get(ex.otherId)!;
      if (limits.allowedEntityTypes && !limits.allowedEntityTypes.includes(other.entityType)) continue;
      out.push(ex);
    }
    out.sort((a, b) => compareEdges(a.edge, b.edge));
    return out;
  }

  private bfsShortest(
    startId: string,
    index: GraphIndexView,
    ctx: GraphQueryContext,
    policy: EdgePolicy,
    mode: "outbound" | "incident",
    relFilter?: (edge: BusinessGraphEdge) => boolean,
  ): { reached: Map<string, { distance: number; path: GraphPath }>; truncated: GraphTruncationState } {
    const limits = policy.limits;
    const truncated = emptyTruncation();
    const reached = new Map<string, { distance: number; path: GraphPath }>();
    reached.set(startId, { distance: 0, path: emptyPath(startId) });
    let frontier: FrontierNode[] = [{ id: startId, path: emptyPath(startId) }];
    let depth = 0;
    let edgeBudget = limits.maxEdges;
    let stop = false;

    while (frontier.length > 0 && depth < limits.maxDepth && !stop) {
      depth += 1;
      const next: FrontierNode[] = [];
      for (const f of frontier) {
        for (const ex of this.expand(f.id, index, ctx, policy, mode, relFilter)) {
          if (edgeBudget <= 0) {
            truncated.byEdges = truncated.truncated = true;
            stop = true;
            break;
          }
          edgeBudget -= 1;
          if (reached.has(ex.otherId)) continue; // visited-set ⇒ cycles terminate
          if (reached.size >= limits.maxNodes) {
            truncated.byNodes = truncated.truncated = true;
            stop = true;
            break;
          }
          const path = extendPath(f.path, ex.edge, ex.otherId);
          reached.set(ex.otherId, { distance: depth, path });
          next.push({ id: ex.otherId, path });
        }
        if (stop) break;
      }
      frontier = next;
    }
    // stopped by depth cap while deeper nodes remained.
    if (!stop && frontier.length > 0 && depth >= limits.maxDepth) {
      truncated.byDepth = truncated.truncated = true;
    }
    return { reached, truncated };
  }

  private shortestPaths(
    startId: string,
    targetId: string,
    index: GraphIndexView,
    ctx: GraphQueryContext,
    policy: EdgePolicy,
  ): { paths: GraphPath[]; truncated: GraphTruncationState } {
    const limits = policy.limits;
    const truncated = emptyTruncation();
    if (startId === targetId) {
      return { paths: [emptyPath(startId)], truncated };
    }
    const found: GraphPath[] = [];
    const visited = new Set<string>([startId]);
    let frontier: FrontierNode[] = [{ id: startId, path: emptyPath(startId) }];
    let depth = 0;
    let edgeBudget = limits.maxEdges;
    let stop = false;

    while (frontier.length > 0 && depth < limits.maxDepth && found.length === 0 && !stop) {
      depth += 1;
      const next: FrontierNode[] = [];
      const reachedThisLevel = new Set<string>();
      for (const f of frontier) {
        for (const ex of this.expand(f.id, index, ctx, policy, "outbound")) {
          if (edgeBudget <= 0) {
            truncated.byEdges = truncated.truncated = true;
            stop = true;
            break;
          }
          edgeBudget -= 1;
          // a node visited on an EARLIER level cannot be on a shortest path here;
          // equal-level rediscovery via a different predecessor IS allowed.
          if (visited.has(ex.otherId)) continue;
          const path = extendPath(f.path, ex.edge, ex.otherId);
          if (ex.otherId === targetId) {
            found.push(path);
          } else {
            next.push({ id: ex.otherId, path });
            reachedThisLevel.add(ex.otherId);
          }
        }
        if (stop) break;
      }
      for (const id of reachedThisLevel) visited.add(id);
      frontier = next;
    }

    found.sort(comparePaths);
    if (found.length > limits.maxPaths) {
      found.length = limits.maxPaths;
      truncated.byPaths = truncated.truncated = true;
    }
    return { paths: found, truncated };
  }

  // -------------------------------------------------------------------------
  // result assembly + safe audit
  // -------------------------------------------------------------------------

  /** Build the shared "not found / forbidden" refusal on an OK prepare (indistinguishable). */
  private emitOkRefuse<T extends GraphTraversalData>(
    prep: PreparedOk,
    ctx: GraphQueryContext,
    operation: GraphTraversalOperation,
    started: number,
  ): Promise<GraphTraversalResult<T>> {
    const refuse: PreparedRefuse = {
      kind: "refuse",
      appliedLimits: prep.appliedLimits,
      requestedLimits: prep.requestedLimits,
      searchTextHash: prep.searchTextHash,
      searchTextClass: prep.searchTextClass,
      startNodeId: prep.startNodeId,
      targetNodeId: prep.targetNodeId,
      staleAccessAuthorized: prep.staleAccessAuthorized,
      health: prep.health,
      snapshotId: prep.snapshot.snapshotId,
      registryVersion: null,
      stale: prep.stale,
      reason: "NODE_NOT_FOUND",
    };
    return this.emit<T>(refuse, ctx, operation, started, null, zeroCounts(), null);
  }

  private async emit<T extends GraphTraversalData>(
    prep: Prepared,
    ctx: GraphQueryContext,
    operation: GraphTraversalOperation,
    started: number,
    data: T | null,
    counts: GraphQueryResultCounts,
    safeDenialReasonOverride: string | null,
    truncated: GraphTruncationState = emptyTruncation(),
  ): Promise<GraphTraversalResult<T>> {
    const ok = prep.kind === "ok" && data !== null;
    const snapshotId = prep.kind === "ok" ? prep.snapshot.snapshotId : prep.snapshotId;
    const registryVersion = prep.kind === "ok" ? prep.snapshot.registryVersion : prep.registryVersion;
    const refusalReason = prep.kind === "refuse" ? prep.reason : safeDenialReasonOverride;

    const filters: GraphQueryFilters = {
      entityTypes: prep.appliedLimits.allowedEntityTypes,
      relationshipTypes: prep.appliedLimits.allowedRelationshipTypes,
      includeInferred: ctx.includeInferred === true,
      includeUnverified: ctx.includeUnverified === true,
    };

    // execution identity (unique per run) is SEPARATE from request identity
    // (deterministic fingerprint over the safe normalized query). Neither is a key.
    const executionId = this.executionIdProvider();
    const requestFingerprint = await deriveRequestFingerprint({
      operation,
      organizationId: ctx.organizationId,
      startNodeId: prep.startNodeId,
      targetNodeId: prep.targetNodeId,
      appliedLimits: prep.appliedLimits,
      filters,
      searchTextHash: prep.searchTextHash,
    });

    const audit = {
      executionId,
      requestFingerprint,
      actorRef: ctx.viewer.actor,
      organizationId: ctx.organizationId,
      operation,
      snapshotId,
      requestedLimits: prep.requestedLimits,
      appliedLimits: prep.appliedLimits,
      filters,
      resultCounts: ok ? counts : zeroCounts(),
      truncated,
      health: prep.health,
      safeDenialReason: refusalReason,
      staleAccessAuthorized: prep.staleAccessAuthorized,
      durationBucket: durationBucket(this.now() - started),
      searchTextHash: prep.searchTextHash,
      searchTextClass: prep.searchTextClass,
    };

    return {
      ok,
      operation,
      organizationId: ctx.organizationId,
      snapshotId,
      health: prep.health,
      stale: prep.stale,
      registryVersion,
      limitsApplied: prep.appliedLimits,
      truncated,
      data: ok ? data : null,
      refusalReason: ok ? null : refusalReason,
      audit,
    };
  }
}

// ---------------------------------------------------------------------------
// module-local pure helpers
// ---------------------------------------------------------------------------

function zeroCounts(): GraphQueryResultCounts {
  return { nodes: 0, edges: 0, paths: 0 };
}

function buildIndex(snapshot: GraphIndexSnapshot): GraphIndexView {
  const nodeById = new Map<string, BusinessGraphNode>();
  for (const node of snapshot.nodes) nodeById.set(node.id, node);
  const edgeById = new Map<string, BusinessGraphEdge>();
  const outByNode = new Map<string, BusinessGraphEdge[]>();
  const inByNode = new Map<string, BusinessGraphEdge[]>();
  for (const edge of snapshot.edges) {
    edgeById.set(edge.id, edge);
    (outByNode.get(edge.source) ?? setGet(outByNode, edge.source)).push(edge);
    (inByNode.get(edge.target) ?? setGet(inByNode, edge.target)).push(edge);
  }
  return { nodeById, edgeById, outByNode, inByNode };
}

function setGet(map: Map<string, BusinessGraphEdge[]>, key: string): BusinessGraphEdge[] {
  const arr: BusinessGraphEdge[] = [];
  map.set(key, arr);
  return arr;
}

interface ScoredMatch {
  score: number;
  field: GraphSearchHit["matchedField"];
}

/**
 * Score a node against a lowercased query over SAFE ENVELOPE METADATA ONLY —
 * title, status, entityType, metadataSummary values. Never inspects a protected
 * payload (the node envelope carries none). Deterministic scoring.
 */
function scoreNode(node: BusinessGraphNode, q: string): ScoredMatch | null {
  const title = node.title.toLowerCase();
  if (title === q) return { score: 100, field: "title" };
  if (title.startsWith(q)) return { score: 80, field: "title" };
  if (title.includes(q)) return { score: 60, field: "title" };
  if ((node.status ?? "").toLowerCase().includes(q)) return { score: 40, field: "status" };
  if (node.entityType.toLowerCase().includes(q)) return { score: 30, field: "entityType" };
  for (const value of Object.values(node.metadataSummary)) {
    if (value !== null && String(value).toLowerCase().includes(q)) {
      return { score: 20, field: "metadata" };
    }
  }
  return null;
}
