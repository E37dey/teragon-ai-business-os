// TERAGON Business Graph — Phase 8 APPLICATION-FACADE contracts (internal).
// ---------------------------------------------------------------------------
// The vocabulary for ONE internal, read-only application boundary that safely
// composes the existing graph layers (store → traversal → business queries).
// A caller crosses in with an OPAQUE session identity + a correlation id + query
// args ONLY. It NEVER supplies a trusted GraphViewerContext, a permission oracle,
// an organizationId, or a query name it did not go through the typed method for.
// The trusted GraphViewerContext is produced by the injected identity resolver;
// the organization comes ONLY from the resolver, never from the request payload.
//
// Nothing here mutates a snapshot/node/edge, opens a protected body, starts a
// subscription, or does background work. Zod guards the boundary a caller crosses.
import { z } from "zod";
import type { ActorRef } from "../contracts/actor";
import type { GraphEntityType, GraphNodeId } from "../contracts/identity";
import { graphNodeIdSchema } from "../contracts/identity";
import type { GraphSensitivity } from "../contracts/node";
import type { GraphIndexHealthState } from "../store/contracts";
import type { TraversalStore } from "../traversal/service";
import type { GraphPermissionOracle } from "../traversal/types";
import type {
  BusinessQueryCapability,
  BusinessQueryCounts,
  BusinessQueryFinding,
  BusinessQueryName,
  BusinessQueryReadiness,
} from "../query/types";
import type {
  BusinessGraphFacadeError,
  BusinessGraphFacadeResultCode,
} from "./errors";

// ---------------------------------------------------------------------------
// opaque session identity (the ONLY identity a caller supplies)
// ---------------------------------------------------------------------------

/**
 * An OPAQUE application/session identity. The facade never parses or trusts it —
 * it hands it verbatim to the injected `BusinessGraphIdentityResolver`, which is
 * the sole authority that turns it into a trusted viewer context. It carries NO
 * organizationId, NO actor kind the facade would trust, and NO viewer context.
 * `sessionRef` is an opaque token whose meaning is known ONLY to the resolver.
 */
export interface BusinessGraphSessionIdentity {
  readonly sessionRef: string;
}

export const businessGraphSessionIdentitySchema = z
  .object({ sessionRef: z.string().min(1) })
  .strict() satisfies z.ZodType<BusinessGraphSessionIdentity>;

// ---------------------------------------------------------------------------
// query args (NO org, NO viewer, NO permission oracle, NO query name)
// ---------------------------------------------------------------------------

/**
 * The safe query arguments a caller may pass. Deliberately EXCLUDES: the query
 * name (supplied by the typed facade method), organizationId (comes only from the
 * resolver), a viewer context, and a permission oracle. The strict schema rejects
 * ANY extra key — an attempt to smuggle `organizationId` / `viewer` / `permissions`
 * fails the boundary parse.
 */
export interface BusinessGraphQueryArgs {
  subjects?: (GraphNodeId | string)[];
  startNodeId?: GraphNodeId | string;
  targetNodeId?: GraphNodeId | string;
  asOf?: string;
  thresholdDays?: number;
  policyVersion?: string;
}

export const businessGraphQueryArgsSchema = z
  .object({
    subjects: z.array(graphNodeIdSchema).optional(),
    startNodeId: graphNodeIdSchema.optional(),
    targetNodeId: graphNodeIdSchema.optional(),
    asOf: z.string().min(1).optional(),
    thresholdDays: z.number().int().nonnegative().max(36_500).optional(),
    policyVersion: z.string().min(1).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// request / access contexts (what crosses the boundary)
// ---------------------------------------------------------------------------

/**
 * The minimal context for the non-query methods (`getCapabilities`,
 * `getQueryReadiness`): an opaque session identity + a correlation id. NO viewer
 * context, NO organizationId.
 */
export interface BusinessGraphAccessContext {
  sessionIdentity: BusinessGraphSessionIdentity;
  correlationId: string;
}

/**
 * The context for a business-query execution: an opaque session identity, a
 * correlation id, and the safe query args. NEVER a viewer context or an
 * organizationId override.
 */
export interface BusinessGraphRequestContext extends BusinessGraphAccessContext {
  args: BusinessGraphQueryArgs;
}

// ---------------------------------------------------------------------------
// identity resolution (the ONLY place a trusted context is produced)
// ---------------------------------------------------------------------------

/**
 * The trusted identity the resolver produces from an opaque session identity.
 * The `actor` is canonical (a named `HumanUserId` when HUMAN); the organization
 * comes from HERE and nowhere else; clearance, allowed entity domains, and the
 * stale-graph permission are all resolver-decided facts.
 */
export interface BusinessGraphResolvedIdentity {
  actor: ActorRef;
  organizationId: string;
  role?: string;
  viewerClearance: GraphSensitivity;
  /** the entity domains this identity may see (null ⇒ no domain narrowing) */
  allowedEntityDomains: readonly GraphEntityType[] | null;
  /** whether this identity may be served a STALE/DEGRADED graph (deny-by-default) */
  allowStaleGraph: boolean;
  /** opaque capability labels (never inspected by the facade; carried for audit) */
  capabilities?: readonly string[];
}

/** The outcome of resolving an opaque session identity. Deny-by-default. */
export type BusinessGraphIdentityResolution =
  | { ok: true; identity: BusinessGraphResolvedIdentity }
  | { ok: false; reason: "UNAUTHENTICATED" | "IDENTITY_AMBIGUOUS" };

/**
 * Resolves an OPAQUE session identity into a trusted resolved identity. Rules the
 * production adapter and every fake MUST honor:
 *   • DENY (UNAUTHENTICATED) when identity is missing;
 *   • DENY (IDENTITY_AMBIGUOUS) when it is ambiguous;
 *   • AGENT and SYSTEM identities are resolved EXPLICITLY — never inferred;
 *   • actor kind is NEVER inferred from an id prefix;
 *   • a demo admin identity is NEVER silently fabricated.
 * The resolver is synchronous and pure w.r.t. its input.
 */
export interface BusinessGraphIdentityResolver {
  resolve(sessionIdentity: BusinessGraphSessionIdentity): BusinessGraphIdentityResolution;
}

// ---------------------------------------------------------------------------
// adapter boundaries (interfaces only — real impls stay UNREGISTERED off-flag)
// ---------------------------------------------------------------------------

/** The read-only store surface the facade needs (never a full GraphIndexStore). */
export type BusinessGraphTraversalStore = TraversalStore;

/**
 * Lazily provides the read-only store surface. `getStore()` is invoked ONLY on
 * the first real query while the flag is ON — NEVER while the flag is OFF, and
 * NEVER at construction/import. `dispose()` releases any handle it opened and is
 * idempotent.
 */
export interface BusinessGraphStoreProvider {
  getStore(): Promise<BusinessGraphTraversalStore>;
  dispose?(): Promise<void> | void;
}

/**
 * Builds a deny-by-default `GraphPermissionOracle` for a resolved identity. This
 * is the seam onto the real product authorization system; the facade NEVER
 * fabricates permissions of its own.
 */
export interface BusinessGraphPermissionAdapter {
  buildOracle(identity: BusinessGraphResolvedIdentity): GraphPermissionOracle;
}

/** The safe, correlated audit record the facade emits for ONE execution. */
export interface BusinessGraphFacadeAuditRecord {
  facadeExecutionId: string;
  correlationId: string;
  operation: BusinessGraphFacadeOperation;
  actorRef: ActorRef | null;
  organizationId: string | null;
  readiness: BusinessQueryReadiness | null;
  health: GraphIndexHealthState | null;
  resultCount: number | null;
  truncated: boolean | null;
  resultCode: BusinessGraphFacadeResultCode;
  /** the business-query execution id (distinct layer) — null when no query ran */
  queryExecutionId: string | null;
  /** every underlying traversal execution id (each a distinct layer execution) */
  traversalExecutionIds: string[];
}

/** The named operations a facade audit record can describe. */
export type BusinessGraphFacadeOperation =
  | BusinessQueryName
  | "getCapabilities"
  | "getQueryReadiness";

/** Injected audit sink. The facade emits ONLY safe metadata here — never the
 *  canonical AuditEvent repo, never raw search text or protected bodies. */
export interface BusinessGraphAuditSink {
  record(record: BusinessGraphFacadeAuditRecord): void;
}

/** Injected clock — no hidden `Date.now`. `nowIso` feeds the query policy/asOf;
 *  `nowMs` feeds the traversal duration bucket. Both are injected. */
export interface BusinessGraphClock {
  nowIso(): string;
  nowMs(): number;
}

// ---------------------------------------------------------------------------
// safe mapped result views (NO raw store / snapshot / traversal / protected body)
// ---------------------------------------------------------------------------

/**
 * The safe projection of a business-query result. It preserves graph health,
 * stale state, readiness, evidence paths, provenance, authority, approval state,
 * truncation, snapshotId, and policyVersion — and NOTHING unsafe. The findings
 * are the query layer's envelope-safe findings (every evidence `bodyOpened` is a
 * constant false), so a protected body can never appear here.
 */
export interface BusinessGraphQueryView {
  query: BusinessQueryName;
  organizationId: string;
  snapshotId: string | null;
  health: GraphIndexHealthState;
  stale: boolean;
  readiness: BusinessQueryReadiness;
  capability: BusinessQueryCapability;
  policyVersion: string;
  findings: readonly BusinessQueryFinding[];
  counts: BusinessQueryCounts;
  truncated: boolean;
  missingFacts: readonly string[];
}

/** The result of ONE facade business-query execution. Never throws to the caller. */
export interface BusinessGraphFacadeResult {
  code: BusinessGraphFacadeResultCode;
  ok: boolean;
  correlationId: string;
  facadeExecutionId: string | null;
  query: BusinessQueryName | null;
  /** the safe mapped view (present only when code === "OK") */
  view: BusinessGraphQueryView | null;
  /** the safe, correlated audit record for this execution (also emitted to the sink) */
  audit: BusinessGraphFacadeAuditRecord | null;
  error: BusinessGraphFacadeError | null;
}

/** One honest capability/readiness row (no repository internals, no file paths). */
export interface BusinessGraphCapabilityView {
  query: BusinessQueryName;
  baselineReadiness: BusinessQueryReadiness;
  requiredEntities: readonly GraphEntityType[];
  /** the required-but-missing graph facts as SAFE metadata (verbatim registry text) */
  missingFacts: readonly string[];
}

/** The result of `getCapabilities()` — all 9, honest, no synthetic augmentation. */
export interface BusinessGraphCapabilityResult {
  code: BusinessGraphFacadeResultCode;
  ok: boolean;
  correlationId: string;
  capabilities: readonly BusinessGraphCapabilityView[];
  error: BusinessGraphFacadeError | null;
}

/** The result of `getQueryReadiness()` — all 9 readiness states + missing facts. */
export interface BusinessGraphReadinessResult {
  code: BusinessGraphFacadeResultCode;
  ok: boolean;
  correlationId: string;
  readiness: readonly BusinessGraphCapabilityView[];
  error: BusinessGraphFacadeError | null;
}

/** The safe status of the facade — never touches the store. */
export interface BusinessGraphFacadeStatus {
  enabled: boolean;
  /** true once the graph services were lazily constructed (only possible when enabled) */
  constructed: boolean;
  /** true once a store handle was lazily opened */
  storeOpened: boolean;
  /** true after `dispose()` */
  disposed: boolean;
}
