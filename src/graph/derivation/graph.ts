// TERAGON Business Graph — pure graph assembly + validation (Phase 3).
// Composes node + edge derivation into an entity graph, a full single-org
// snapshot (with an internally-built lookup over the supplied records), and a
// re-validation pass. Deterministic: every collection is sorted by stable keys
// so identical input ⇒ byte-equivalent output.
import { GRAPH_ENTITY_TYPES, type GraphEntityType } from "../contracts/identity";
import type { BusinessGraphNode } from "../contracts/node";
import type { BusinessGraphEdge } from "../contracts/edge";
import { ENTITY_REGISTRY } from "../registry/entityRegistry";
import { deriveGraphNode } from "./node";
import { deriveGraphEdges } from "./edges";
import { computeArchived, computeSuperseded, makeIssue, readField, readStringField } from "./internal";
import {
  DERIVATION_STATUS,
  type CanonicalRecord,
  type DerivationSeverity,
  type GraphDerivationContext,
  type GraphDerivationIssue,
  type GraphDerivationLookup,
  type GraphDerivationResult,
  type GraphDerivationStats,
  type GraphLookupTarget,
  type GraphUnmappableRecord,
} from "./types";

// ---------------------------------------------------------------------------
// deterministic sort keys
// ---------------------------------------------------------------------------

const byNodeId = (a: BusinessGraphNode, b: BusinessGraphNode): number => a.id.localeCompare(b.id);
const byEdgeId = (a: BusinessGraphEdge, b: BusinessGraphEdge): number => a.id.localeCompare(b.id);

function issueKey(i: GraphDerivationIssue): string {
  return [
    i.code,
    i.sourceEntityType,
    i.sourceEntityId,
    i.field ?? "",
    i.attemptedRelationship ?? "",
  ].join("|");
}
const byIssue = (a: GraphDerivationIssue, b: GraphDerivationIssue): number =>
  issueKey(a).localeCompare(issueKey(b));

const byUnmappable = (a: GraphUnmappableRecord, b: GraphUnmappableRecord): number =>
  `${a.entityType}|${a.entityId}|${a.reason}`.localeCompare(`${b.entityType}|${b.entityId}|${b.reason}`);

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

function computeStats(args: {
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
  issues: GraphDerivationIssue[];
  unmappableRecords: GraphUnmappableRecord[];
  duplicateEdges: BusinessGraphEdge[];
  orphanReferences: GraphDerivationIssue[];
}): GraphDerivationStats {
  const nodesByType: Record<string, number> = {};
  for (const n of args.nodes) nodesByType[n.entityType] = (nodesByType[n.entityType] ?? 0) + 1;
  const edgesByType: Record<string, number> = {};
  const edgesByProvenance: Record<string, number> = {};
  const edgesByAuthority: Record<string, number> = {};
  for (const e of args.edges) {
    edgesByType[e.relationshipType] = (edgesByType[e.relationshipType] ?? 0) + 1;
    edgesByProvenance[e.provenance] = (edgesByProvenance[e.provenance] ?? 0) + 1;
    edgesByAuthority[e.authority] = (edgesByAuthority[e.authority] ?? 0) + 1;
  }
  const issuesBySeverity: Record<DerivationSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of args.issues) issuesBySeverity[i.severity] += 1;
  return {
    nodesByType,
    edgesByType,
    edgesByProvenance,
    edgesByAuthority,
    issuesBySeverity,
    unmappable: args.unmappableRecords.length,
    duplicateEdges: args.duplicateEdges.length,
    orphanReferences: args.orphanReferences.length,
  };
}

// ---------------------------------------------------------------------------
// deriveEntityGraph — one record's node + its edges
// ---------------------------------------------------------------------------

export function deriveEntityGraph(
  record: CanonicalRecord,
  entityType: GraphEntityType,
  lookup: GraphDerivationLookup,
  context: GraphDerivationContext,
): GraphDerivationResult {
  const nodeOut = deriveGraphNode(record, entityType, {
    organizationId: context.organizationId,
    allowOrgInheritance: context.allowOrgInheritance,
  });
  const nodes: BusinessGraphNode[] = nodeOut.node ? [nodeOut.node] : [];
  const unmappableRecords: GraphUnmappableRecord[] = nodeOut.unmappable ? [nodeOut.unmappable] : [];
  const issues: GraphDerivationIssue[] = [...nodeOut.issues];

  let edges: BusinessGraphEdge[] = [];
  if (nodeOut.node) {
    const edgeOut = deriveGraphEdges(record, entityType, lookup, context);
    edges = edgeOut.edges;
    issues.push(...edgeOut.issues);
  }

  return finalize({
    nodes,
    edges,
    issues,
    unmappableRecords,
    duplicateEdges: [],
    orphanReferences: [],
    context,
  });
}

// ---------------------------------------------------------------------------
// internal lookup built over the supplied records map
// ---------------------------------------------------------------------------

function targetOf(record: CanonicalRecord, entityType: GraphEntityType): GraphLookupTarget {
  const entry = ENTITY_REGISTRY[entityType];
  const orgRaw = entry.organizationField ? readField(record, entry.organizationField) : undefined;
  return {
    organizationId: typeof orgRaw === "string" ? orgRaw : null,
    archived: computeArchived(record, entry),
    superseded: computeSuperseded(record, entry),
    rejected: readField(record, "rejected") === true || readField(record, "status") === "נדחה",
    status: entry.lifecycleField ? readStringField(record, entry.lifecycleField) : null,
  };
}

function buildLookup(
  records: Partial<Record<string, CanonicalRecord[]>>,
): GraphDerivationLookup {
  // index by entityType → id → record, keyed off each entity's repository.
  const index = new Map<GraphEntityType, Map<string, CanonicalRecord>>();
  for (const entityType of GRAPH_ENTITY_TYPES) {
    const entry = ENTITY_REGISTRY[entityType];
    if (!entry.repository) continue;
    const coll = records[entry.repository];
    if (!coll) continue;
    const map = index.get(entityType) ?? new Map<string, CanonicalRecord>();
    for (const rec of coll) {
      const id = readStringField(rec, entry.identifierField);
      if (id !== null) map.set(id, rec);
    }
    index.set(entityType, map);
  }
  return {
    exists: (entityType, entityId) => index.get(entityType)?.has(entityId) ?? false,
    get: (entityType, entityId) => {
      const rec = index.get(entityType)?.get(entityId);
      return rec ? targetOf(rec, entityType) : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// deriveOrganizationGraphSnapshot — full single-org snapshot
// ---------------------------------------------------------------------------

export function deriveOrganizationGraphSnapshot(
  records: Partial<Record<string, CanonicalRecord[]>>,
  context: GraphDerivationContext,
): GraphDerivationResult {
  const lookup = buildLookup(records);
  const nodes: BusinessGraphNode[] = [];
  const edges: BusinessGraphEdge[] = [];
  const issues: GraphDerivationIssue[] = [];
  const unmappableRecords: GraphUnmappableRecord[] = [];

  for (const entityType of GRAPH_ENTITY_TYPES) {
    const entry = ENTITY_REGISTRY[entityType];
    if (!entry.repository) continue;
    if (DERIVATION_STATUS[entityType] === "EXCLUDED") continue;
    const coll = records[entry.repository];
    if (!coll) continue;
    for (const rec of coll) {
      const nodeOut = deriveGraphNode(rec, entityType, {
        organizationId: context.organizationId,
        allowOrgInheritance: context.allowOrgInheritance,
      });
      issues.push(...nodeOut.issues);
      if (nodeOut.unmappable) unmappableRecords.push(nodeOut.unmappable);
      if (!nodeOut.node) continue;
      nodes.push(nodeOut.node);
      const edgeOut = deriveGraphEdges(rec, entityType, lookup, context);
      edges.push(...edgeOut.edges);
      issues.push(...edgeOut.issues);
    }
  }

  // cross-record duplicate-edge detection (same deterministic edge id twice).
  const kept = new Map<string, BusinessGraphEdge>();
  const duplicateEdges: BusinessGraphEdge[] = [];
  for (const e of [...edges].sort(byEdgeId)) {
    if (kept.has(e.id)) {
      duplicateEdges.push(e);
      issues.push(makeIssue("DUPLICATE_EDGE", entityTypeOfNode(e.source), e.id));
    } else {
      kept.set(e.id, e);
    }
  }

  const merged = finalize({
    nodes,
    edges: [...kept.values()],
    issues,
    unmappableRecords,
    duplicateEdges,
    orphanReferences: [],
    context,
  });

  // run the invariant re-check and fold its findings in.
  return validateDerivedGraph(merged);
}

/** Best-effort entity-type extraction from a node id (for duplicate issue tagging). */
function entityTypeOfNode(nodeId: string): GraphEntityType {
  const parts = nodeId.replace("teragon://", "").split("/");
  const t = parts[1];
  return (t && (GRAPH_ENTITY_TYPES as readonly string[]).includes(t) ? t : "customer") as GraphEntityType;
}

// ---------------------------------------------------------------------------
// validateDerivedGraph — re-check invariants over a snapshot
// ---------------------------------------------------------------------------

const BODY_KEYS: readonly string[] = [
  "body",
  "content",
  "bodyMarkdown",
  "markdown",
  "prompt",
  "notes",
  "plainText",
];

export function validateDerivedGraph(snapshot: GraphDerivationResult): GraphDerivationResult {
  const extraIssues: GraphDerivationIssue[] = [];
  const orphanReferences: GraphDerivationIssue[] = [];
  const nodeIds = new Set(snapshot.nodes.map((n) => n.id));

  // dangling endpoints — an edge pointing at a node not in the snapshot.
  const incident = new Set<string>();
  for (const e of snapshot.edges) {
    incident.add(e.source);
    incident.add(e.target);
    if (!nodeIds.has(e.source)) {
      const issue = makeIssue("DANGLING_ENDPOINT", entityTypeOfNode(e.source), e.id, {
        reasonHe: `מקור הקשת ${e.source} אינו בתמונת המצב`,
      });
      extraIssues.push(issue);
      orphanReferences.push(issue);
    }
    if (!nodeIds.has(e.target)) {
      const issue = makeIssue("DANGLING_ENDPOINT", entityTypeOfNode(e.target), e.id, {
        reasonHe: `יעד הקשת ${e.target} אינו בתמונת המצב`,
      });
      extraIssues.push(issue);
      orphanReferences.push(issue);
    }
  }

  // orphan nodes — no incident edge.
  for (const n of snapshot.nodes) {
    if (!incident.has(n.id)) {
      extraIssues.push(makeIssue("ORPHAN_NODE", n.entityType, n.entityId));
    }
    // sensitivity leakage — a body key must never appear on a node envelope.
    for (const k of BODY_KEYS) {
      if (k in n.metadataSummary) {
        extraIssues.push(makeIssue("SENSITIVITY_BLOCKED", n.entityType, n.entityId, { field: k }));
      }
    }
  }

  // duplicate-edge re-check (defensive — snapshot should already have deduped).
  const seen = new Set<string>();
  const duplicateEdges = [...snapshot.duplicateEdges];
  for (const e of snapshot.edges) {
    if (seen.has(e.id)) {
      duplicateEdges.push(e);
      extraIssues.push(makeIssue("DUPLICATE_EDGE", entityTypeOfNode(e.source), e.id));
    } else {
      seen.add(e.id);
    }
  }

  return finalize({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    issues: [...snapshot.issues, ...extraIssues],
    unmappableRecords: snapshot.unmappableRecords,
    duplicateEdges,
    orphanReferences: [...snapshot.orphanReferences, ...orphanReferences],
    context: {
      registryVersion: snapshot.registryVersion,
      sourceSnapshotVersion: snapshot.sourceSnapshotVersion,
    },
  });
}

// ---------------------------------------------------------------------------
// finalize — sort every collection + compute stats (deterministic output)
// ---------------------------------------------------------------------------

function finalize(args: {
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
  issues: GraphDerivationIssue[];
  unmappableRecords: GraphUnmappableRecord[];
  duplicateEdges: BusinessGraphEdge[];
  orphanReferences: GraphDerivationIssue[];
  context: Pick<GraphDerivationContext, "registryVersion" | "sourceSnapshotVersion">;
}): GraphDerivationResult {
  const nodes = dedupeById([...args.nodes].sort(byNodeId), (n) => n.id);
  const edges = dedupeById([...args.edges].sort(byEdgeId), (e) => e.id);
  const issues = [...args.issues].sort(byIssue);
  const unmappableRecords = [...args.unmappableRecords].sort(byUnmappable);
  const duplicateEdges = [...args.duplicateEdges].sort(byEdgeId);
  const orphanReferences = [...args.orphanReferences].sort(byIssue);
  return {
    nodes,
    edges,
    issues,
    unmappableRecords,
    duplicateEdges,
    orphanReferences,
    stats: computeStats({ nodes, edges, issues, unmappableRecords, duplicateEdges, orphanReferences }),
    registryVersion: args.context.registryVersion,
    sourceSnapshotVersion: args.context.sourceSnapshotVersion,
  };
}

function dedupeById<T>(sorted: T[], id: (t: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of sorted) {
    const key = id(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
