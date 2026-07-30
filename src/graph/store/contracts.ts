// TERAGON Business Graph — index-store contracts (Phase 4, persistence layer).
// ---------------------------------------------------------------------------
// The DERIVED graph index is read-only from the product modules, rebuildable,
// replaceable, and NEVER the canonical source of truth. This module owns the
// contract vocabulary for persisting a derived snapshot: the snapshot model, the
// build-state machine, validation/recovery/health result shapes, the store
// interface, and the zod schemas used wherever a value crosses the persistence
// boundary (a store read must re-validate; a store write must be well-formed).
//
// The store interface intentionally exposes NO node/edge mutators. Nodes and
// edges enter the store ONLY as a complete derived snapshot (stageSnapshot).
import { z } from "zod";
import {
  graphEntityTypeSchema,
  type GraphEntityType,
} from "../contracts/identity";
import { graphRelationshipTypeSchema } from "../contracts/edge";
import { businessGraphEdgeSchema, type BusinessGraphEdge } from "../contracts/edge";
import { businessGraphNodeSchema, type BusinessGraphNode } from "../contracts/node";
import {
  DERIVATION_ISSUE_CODES,
  type DerivationIssueCode,
  type DerivationSeverity,
  type GraphDerivationIssue,
  type GraphUnmappableRecord,
} from "../derivation";

// ---------------------------------------------------------------------------
// version pins (what this index build understands)
// ---------------------------------------------------------------------------

/**
 * The persisted graph-index schema version (the shape of a stored snapshot).
 * Bumped to v2 when the integrity checksum moved from FNV-1a to SHA-256: a
 * legacy `graph-index-v1` (FNV) snapshot is therefore UNSUPPORTED and must be
 * rebuilt — it is never silently accepted (validation errors + health
 * REBUILD_REQUIRED). No production index existed, so a rebuild suffices.
 */
export const GRAPH_INDEX_SCHEMA_VERSION = "graph-index-v2";
/** The derivation vintage this index was built against (Phase-3 pure derivation). */
export const GRAPH_INDEX_DERIVATION_VERSION = "phase-3";

/**
 * The integrity-checksum algorithm + version. SHA-256 (Web Crypto, standardized
 * and byte-identical in browser + Node), NOT a keyed/secret hash. `checksum`,
 * `sourceHash`, and recovery integrity validation all use it. Any snapshot whose
 * algorithm/version is not this pair is not a supported integrity checksum.
 */
export const GRAPH_INDEX_CHECKSUM_ALGORITHM = "SHA-256" as const;
export const GRAPH_INDEX_CHECKSUM_VERSION = 1 as const;
export type GraphIndexChecksumAlgorithm = typeof GRAPH_INDEX_CHECKSUM_ALGORITHM;

/** Schema versions this build can safely activate/read. */
export const SUPPORTED_GRAPH_INDEX_SCHEMA_VERSIONS: readonly string[] = [
  GRAPH_INDEX_SCHEMA_VERSION,
];
/**
 * Registry versions this build can safely activate/read. Phase 9 bumped the
 * derivation registry `core-v1 → core-v2` (new canonical-id edge derivations +
 * the enrollment stage projection). A snapshot built under `core-v1` is NO LONGER
 * supported — it reports health REBUILD_REQUIRED (and validation
 * REGISTRY_VERSION_UNSUPPORTED) and rebuilds cleanly, since the index is derived
 * (no in-place mutation).
 */
export const SUPPORTED_GRAPH_REGISTRY_VERSIONS: readonly string[] = ["core-v2"];

// ---------------------------------------------------------------------------
// closed activation policy (NOT caller-supplied)
// ---------------------------------------------------------------------------

/**
 * The CLOSED internal activation policy. `SAFE_NON_INDEXABLE_ACTIVATION_CODES`
 * is the ONLY set of derivation issue codes that an activation may tolerate at
 * error severity — "this record is simply not indexable" reasons that carry no
 * security or integrity risk. It is a fixed constant, NEVER supplied by UI /
 * agents / caller input.
 *
 * `FORBIDDEN_ACTIVATION_CODES` can NEVER be allow-listed or downgraded through
 * ANY configuration — passing one anywhere is ignored and still blocks
 * activation. These are the cross-org / duplicate / endpoint / identity /
 * sensitivity / checksum failures whose whole purpose is to refuse a bad graph.
 * (CHECKSUM_MISMATCH / DUPLICATE_NODE_ID / DUPLICATE_EDGE_ID / MALFORMED_IDENTITY
 * / SENSITIVE_PAYLOAD_LEAK / MISSING_EDGE_ENDPOINT map to these derivation codes
 * plus the always-blocking structural validation checks in validation.ts, which
 * no allow-list can touch.)
 */
export const SAFE_NON_INDEXABLE_ACTIVATION_CODES: readonly DerivationIssueCode[] = [
  "EXCLUDED_ENTITY",
  "UNMAPPABLE_ENTITY",
  "UNSUPPORTED_REFERENCE",
];

export const FORBIDDEN_ACTIVATION_CODES: readonly DerivationIssueCode[] = [
  "CROSS_ORGANIZATION",
  "SENSITIVITY_BLOCKED",
  "DANGLING_ENDPOINT",
  "MISSING_ORGANIZATION",
  "DUPLICATE_EDGE",
  "MALFORMED_REFERENCE",
];

// ---------------------------------------------------------------------------
// build-state machine
// ---------------------------------------------------------------------------

/**
 * The lifecycle of a snapshot inside the index. Legal transitions:
 *   STAGED      → VALIDATING (validateStagedSnapshot begins)
 *   VALIDATING  → VALID | INVALID (validation verdict)
 *   VALID       → ACTIVE (activateSnapshot; the previous ACTIVE → SUPERSEDED)
 *   ACTIVE      → SUPERSEDED (replaced by a newer ACTIVE, or by a RECOVERY)
 *   (VALID|SUPERSEDED) → RECOVERY (restoreSnapshot re-activates a known-good)
 *   any staged step → FAILED (a build/step error, diagnostics preserved)
 * INVARIANT: an INVALID or FAILED snapshot must NEVER become ACTIVE. Exactly one
 * ACTIVE (or RECOVERY, which is an active recovery) snapshot exists per org.
 */
export const GRAPH_INDEX_BUILD_STATES = [
  "STAGED",
  "VALIDATING",
  "VALID",
  "INVALID",
  "ACTIVE",
  "SUPERSEDED",
  "RECOVERY",
  "FAILED",
] as const;
export type GraphIndexBuildState = (typeof GRAPH_INDEX_BUILD_STATES)[number];
export const graphIndexBuildStateSchema = z.enum(GRAPH_INDEX_BUILD_STATES);

/** Whether a build-state counts as the single serving snapshot for its org. */
export function isServingBuildState(state: GraphIndexBuildState): boolean {
  return state === "ACTIVE" || state === "RECOVERY";
}

export const GRAPH_INDEX_VALIDATION_STATES = ["UNVALIDATED", "VALID", "INVALID"] as const;
export type GraphIndexValidationState = (typeof GRAPH_INDEX_VALIDATION_STATES)[number];
export const graphIndexValidationStateSchema = z.enum(GRAPH_INDEX_VALIDATION_STATES);

// ---------------------------------------------------------------------------
// issue counts
// ---------------------------------------------------------------------------

export type GraphIndexIssueCounts = Record<DerivationSeverity, number>;

export const graphIndexIssueCountsSchema = z.object({
  error: z.number().int().min(0),
  warning: z.number().int().min(0),
  info: z.number().int().min(0),
}) satisfies z.ZodType<GraphIndexIssueCounts>;

// ---------------------------------------------------------------------------
// derivation issue / unmappable schemas (they cross the persistence boundary)
// ---------------------------------------------------------------------------

const derivationSeveritySchema = z.enum(["error", "warning", "info"]);
const derivationIssueCodeSchema = z.enum(DERIVATION_ISSUE_CODES);

export const graphDerivationIssueSchema = z.object({
  code: derivationIssueCodeSchema,
  sourceEntityType: graphEntityTypeSchema,
  sourceEntityId: z.string(),
  field: z.string().optional(),
  attemptedRelationship: graphRelationshipTypeSchema.optional(),
  severity: derivationSeveritySchema,
  reasonHe: z.string(),
  safeRemediationHe: z.string(),
  indexingMayContinue: z.boolean(),
}) satisfies z.ZodType<GraphDerivationIssue>;

export const graphUnmappableRecordSchema = z.object({
  entityType: graphEntityTypeSchema,
  entityId: z.string(),
  reason: derivationIssueCodeSchema,
  detailHe: z.string(),
}) satisfies z.ZodType<GraphUnmappableRecord>;

// ---------------------------------------------------------------------------
// snapshot model
// ---------------------------------------------------------------------------

/**
 * A complete, persisted derived graph snapshot. `sourceHash` and `checksum` are
 * deterministic stable hashes (see hash.ts). `checksum` covers the full graph
 * content and detects corruption/partial writes; `sourceHash` covers only the
 * source-derived nodes+edges and detects source staleness vs. the latest
 * canonical derivation. `snapshotId` deterministically embeds the checksum — it
 * is NOT a random uuid and NOT a timestamp.
 */
export interface GraphIndexSnapshot {
  snapshotId: string;
  organizationId: string;
  /** metadata timestamp only — NEVER part of any hash */
  createdAt: string;
  sourceSnapshotVersion: string;
  sourceHash: string;
  registryVersion: string;
  schemaVersion: string;
  derivationVersion: string;
  nodeCount: number;
  edgeCount: number;
  issueCounts: GraphIndexIssueCounts;
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
  issues: GraphDerivationIssue[];
  unmappableRecords: GraphUnmappableRecord[];
  validationState: GraphIndexValidationState;
  buildState: GraphIndexBuildState;
  /** activation timestamp only — NEVER part of any hash */
  activatedAt: string | null;
  supersedesSnapshotId: string | null;
  /** the SHA-256 integrity checksum (full 64-hex, ≥128-bit) — see hash.ts */
  checksum: string;
  /** the integrity algorithm the checksum was computed with (always "SHA-256") */
  checksumAlgorithm: GraphIndexChecksumAlgorithm;
  /** the checksum-scheme version (bumped if the hashing scheme ever changes) */
  checksumVersion: number;
}

/** The snapshot header (everything except the heavy content arrays). */
export type GraphIndexSnapshotHeader = Omit<
  GraphIndexSnapshot,
  "nodes" | "edges" | "issues" | "unmappableRecords"
> & { unmappableCount: number };

export const graphIndexSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  organizationId: z.string().min(1),
  createdAt: z.string(),
  sourceSnapshotVersion: z.string(),
  sourceHash: z.string().min(1),
  registryVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  derivationVersion: z.string().min(1),
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
  issueCounts: graphIndexIssueCountsSchema,
  nodes: z.array(businessGraphNodeSchema),
  edges: z.array(businessGraphEdgeSchema),
  issues: z.array(graphDerivationIssueSchema),
  unmappableRecords: z.array(graphUnmappableRecordSchema),
  validationState: graphIndexValidationStateSchema,
  buildState: graphIndexBuildStateSchema,
  activatedAt: z.string().nullable(),
  supersedesSnapshotId: z.string().nullable(),
  checksum: z.string().min(1),
  checksumAlgorithm: z.literal(GRAPH_INDEX_CHECKSUM_ALGORITHM),
  checksumVersion: z.literal(GRAPH_INDEX_CHECKSUM_VERSION),
});

// ---------------------------------------------------------------------------
// manifest — the per-organization pointer record (one ACTIVE, ordered history)
// ---------------------------------------------------------------------------

export interface GraphIndexManifest {
  organizationId: string;
  activeSnapshotId: string | null;
  /** all snapshotIds known for this org, newest-appended */
  snapshotIds: string[];
  schemaVersion: string;
  updatedAt: string;
}

export const graphIndexManifestSchema = z.object({
  organizationId: z.string().min(1),
  activeSnapshotId: z.string().nullable(),
  snapshotIds: z.array(z.string()),
  schemaVersion: z.string().min(1),
  updatedAt: z.string(),
}) satisfies z.ZodType<GraphIndexManifest>;

// ---------------------------------------------------------------------------
// build request/result envelope
// ---------------------------------------------------------------------------

import type { GraphDerivationResult } from "../derivation";

/** The in-memory, pre-persistence product of a full rebuild. */
export interface GraphIndexBuild {
  organizationId: string;
  snapshot: GraphIndexSnapshot;
  derivation: GraphDerivationResult;
}

export type GraphIndexBuildOutcome =
  | "ACTIVATED"
  | "REJECTED_INVALID"
  | "REJECTED_CHECKSUM"
  | "FAILED";

/** The exhaustive result of `rebuildOrganizationGraph`. */
export interface GraphIndexBuildResult {
  outcome: GraphIndexBuildOutcome;
  activated: boolean;
  snapshotId: string | null;
  snapshot: GraphIndexSnapshot | null;
  validation: GraphIndexValidationResult | null;
  /** the snapshot that WAS active and is now SUPERSEDED (only on ACTIVATED) */
  supersededSnapshotId: string | null;
  /** the active snapshot preserved UNCHANGED when the rebuild did not activate */
  previousActiveSnapshotId: string | null;
  errorCode: string | null;
  errorHe: string | null;
}

// ---------------------------------------------------------------------------
// validation result
// ---------------------------------------------------------------------------

export interface GraphIndexValidationIssue {
  code: string;
  severity: "error" | "warning";
  messageHe: string;
  ref?: string;
}

export interface GraphIndexValidationResult {
  snapshotId: string;
  organizationId: string;
  valid: boolean;
  checkedAt: string;
  errors: GraphIndexValidationIssue[];
  warnings: GraphIndexValidationIssue[];
  checksumVerified: boolean;
  coreV1Covered: boolean;
}

// ---------------------------------------------------------------------------
// recovery point
// ---------------------------------------------------------------------------

export interface GraphIndexRecoveryPoint {
  recoveryPointId: string;
  organizationId: string;
  createdAt: string;
  /** the (unhealthy) snapshot that was replaced, if any */
  replacedSnapshotId: string | null;
  /** the known-good snapshot that was re-activated */
  restoredSnapshotId: string;
  reasonCode: string;
  reasonHe: string;
}

export const graphIndexRecoveryPointSchema = z.object({
  recoveryPointId: z.string().min(1),
  organizationId: z.string().min(1),
  createdAt: z.string(),
  replacedSnapshotId: z.string().nullable(),
  restoredSnapshotId: z.string().min(1),
  reasonCode: z.string(),
  reasonHe: z.string(),
}) satisfies z.ZodType<GraphIndexRecoveryPoint>;

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

export const GRAPH_INDEX_HEALTH_STATES = [
  "HEALTHY",
  "STALE",
  "DEGRADED",
  "CORRUPT",
  "MISSING",
  "REBUILD_REQUIRED",
] as const;
export type GraphIndexHealthState = (typeof GRAPH_INDEX_HEALTH_STATES)[number];

export interface GraphIndexHealthFinding {
  code: string;
  severity: "info" | "warning" | "error";
  messageHe: string;
}

export interface GraphIndexHealth {
  organizationId: string;
  state: GraphIndexHealthState;
  checkedAt: string;
  activeSnapshotId: string | null;
  checksumVerified: boolean;
  findings: GraphIndexHealthFinding[];
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type GraphIndexErrorCode =
  | "GRAPH_INDEX_SNAPSHOT_NOT_FOUND"
  | "GRAPH_INDEX_NOT_VALIDATED"
  | "GRAPH_INDEX_INVALID_ACTIVATION"
  | "GRAPH_INDEX_CHECKSUM_MISMATCH"
  | "GRAPH_INDEX_ORG_MISMATCH"
  | "GRAPH_INDEX_CORRUPT"
  | "GRAPH_INDEX_STATE"
  | "GRAPH_INDEX_UNAVAILABLE";

export class GraphIndexError extends Error {
  readonly code: GraphIndexErrorCode;
  readonly detailHe: string;

  constructor(code: GraphIndexErrorCode, detailHe: string) {
    super(`${code}: ${detailHe}`);
    this.name = "GraphIndexError";
    this.code = code;
    this.detailHe = detailHe;
  }
}

// ---------------------------------------------------------------------------
// the store interface — ONLY these mutators. No node/edge CRUD, ever.
// ---------------------------------------------------------------------------

export interface GraphIndexStore {
  /** the single serving (ACTIVE/RECOVERY) snapshot for an org, or null */
  getActiveSnapshot(organizationId: string): Promise<GraphIndexSnapshot | null>;
  /** a full snapshot by id (reassembled + re-validated on read), or null */
  getSnapshot(snapshotId: string): Promise<GraphIndexSnapshot | null>;
  /** headers of every snapshot for an org, org-scoped via the manifest */
  listSnapshots(organizationId: string): Promise<GraphIndexSnapshotHeader[]>;
  /** persist a complete derived snapshot as STAGED (atomic multi-store write) */
  stageSnapshot(snapshot: GraphIndexSnapshot): Promise<void>;
  /** run full validation on a staged snapshot; writes VALID/INVALID verdict */
  validateStagedSnapshot(snapshotId: string): Promise<GraphIndexValidationResult>;
  /** atomically make a VALID snapshot ACTIVE (previous ACTIVE → SUPERSEDED) */
  activateSnapshot(snapshotId: string): Promise<GraphIndexSnapshot>;
  /** delete a staged/invalid snapshot and its content (never a served one) */
  discardStagedSnapshot(snapshotId: string): Promise<void>;
  /** non-destructively re-activate a known-good snapshot as RECOVERY */
  restoreSnapshot(snapshotId: string): Promise<GraphIndexRecoveryPoint>;
  /** remove only retention-eligible historical snapshots; returns deleted ids */
  deleteExpiredSnapshots(organizationId: string): Promise<string[]>;
  /** verify checksum + active snapshot + integrity — never "HEALTHY if IDB opens" */
  getHealth(organizationId: string, latestSourceHash?: string): Promise<GraphIndexHealth>;
}

// ---------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------

/** Derive the {error,warning,info} counts from a list of derivation issues. */
export function countIssues(issues: readonly GraphDerivationIssue[]): GraphIndexIssueCounts {
  const counts: GraphIndexIssueCounts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity] += 1;
  return counts;
}

/** The Core-V1 entity types every index build must attempt to cover as nodes. */
export const GRAPH_INDEX_CORE_V1_TYPES: readonly GraphEntityType[] = [
  "customer",
  "lead",
  "opportunity",
  "quotation",
  "customerPrinter",
  "printerModel",
  "serviceTicket",
  "knowledgeArticle",
  "aiRecommendation",
  "approval",
  "task",
  "agentRun",
  "course",
  "enrollment",
  "memoryRecord",
];
