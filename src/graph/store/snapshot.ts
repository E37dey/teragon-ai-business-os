// TERAGON Business Graph — snapshot assembly (Phase 4).
// Wraps a PURE Phase-3 GraphDerivationResult into a persistable, STAGED
// GraphIndexSnapshot: computes the deterministic sourceHash + checksum, derives
// the deterministic snapshotId, and stamps the (non-hashed) createdAt metadata.
import type { GraphDerivationResult } from "../derivation";
import type { GraphDerivationContext } from "../derivation";
import {
  GRAPH_INDEX_CHECKSUM_ALGORITHM,
  GRAPH_INDEX_CHECKSUM_VERSION,
  GRAPH_INDEX_DERIVATION_VERSION,
  GRAPH_INDEX_SCHEMA_VERSION,
  countIssues,
  type GraphIndexBuild,
  type GraphIndexSnapshot,
} from "./contracts";
import { buildSnapshotId, computeChecksum, computeSourceHash } from "./hash";

export interface SnapshotBuildOptions {
  /** injected clock for createdAt (metadata only, never hashed) */
  now?: () => string;
  schemaVersion?: string;
  derivationVersion?: string;
}

/**
 * Build a STAGED, UNVALIDATED snapshot from a derivation result. The result is
 * already deterministically sorted by the derivation, so the hashes are stable.
 * `createdAt` comes from the clock and is DELIBERATELY excluded from every hash.
 */
export async function buildIndexSnapshot(
  derivation: GraphDerivationResult,
  context: GraphDerivationContext,
  options: SnapshotBuildOptions = {},
): Promise<GraphIndexBuild> {
  const now = options.now ?? (() => new Date().toISOString());
  const schemaVersion = options.schemaVersion ?? GRAPH_INDEX_SCHEMA_VERSION;
  const derivationVersion = options.derivationVersion ?? GRAPH_INDEX_DERIVATION_VERSION;
  const organizationId = context.organizationId;
  const registryVersion = derivation.registryVersion;
  const sourceSnapshotVersion = derivation.sourceSnapshotVersion;

  const sourceHash = await computeSourceHash({
    registryVersion,
    sourceSnapshotVersion,
    nodes: derivation.nodes,
    edges: derivation.edges,
  });
  const checksum = await computeChecksum({
    schemaVersion,
    registryVersion,
    derivationVersion,
    organizationId,
    sourceSnapshotVersion,
    checksumAlgorithm: GRAPH_INDEX_CHECKSUM_ALGORITHM,
    checksumVersion: GRAPH_INDEX_CHECKSUM_VERSION,
    nodes: derivation.nodes,
    edges: derivation.edges,
    issues: derivation.issues,
    unmappableRecords: derivation.unmappableRecords,
  });
  const snapshotId = buildSnapshotId(organizationId, checksum);

  const snapshot: GraphIndexSnapshot = {
    snapshotId,
    organizationId,
    createdAt: now(),
    sourceSnapshotVersion,
    sourceHash,
    registryVersion,
    schemaVersion,
    derivationVersion,
    nodeCount: derivation.nodes.length,
    edgeCount: derivation.edges.length,
    issueCounts: countIssues(derivation.issues),
    nodes: derivation.nodes,
    edges: derivation.edges,
    issues: derivation.issues,
    unmappableRecords: derivation.unmappableRecords,
    validationState: "UNVALIDATED",
    buildState: "STAGED",
    activatedAt: null,
    supersedesSnapshotId: null,
    checksum,
    checksumAlgorithm: GRAPH_INDEX_CHECKSUM_ALGORITHM,
    checksumVersion: GRAPH_INDEX_CHECKSUM_VERSION,
  };

  return { organizationId, snapshot, derivation };
}

/** Recompute the SHA-256 checksum of an already-built snapshot (integrity re-check). */
export async function recomputeChecksum(snapshot: GraphIndexSnapshot): Promise<string> {
  return computeChecksum({
    schemaVersion: snapshot.schemaVersion,
    registryVersion: snapshot.registryVersion,
    derivationVersion: snapshot.derivationVersion,
    organizationId: snapshot.organizationId,
    sourceSnapshotVersion: snapshot.sourceSnapshotVersion,
    checksumAlgorithm: snapshot.checksumAlgorithm,
    checksumVersion: snapshot.checksumVersion,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    issues: snapshot.issues,
    unmappableRecords: snapshot.unmappableRecords,
  });
}

/** Recompute the source hash of a snapshot (staleness re-check). */
export async function recomputeSourceHash(snapshot: GraphIndexSnapshot): Promise<string> {
  return computeSourceHash({
    registryVersion: snapshot.registryVersion,
    sourceSnapshotVersion: snapshot.sourceSnapshotVersion,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  });
}
