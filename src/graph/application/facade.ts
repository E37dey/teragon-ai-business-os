// TERAGON Business Graph — Phase 8 read-only APPLICATION FACADE (internal).
// ---------------------------------------------------------------------------
// BusinessGraphApplicationFacade is ONE internal application boundary that
// safely composes the existing graph layers. It is default-OFF, read-only, and
// NOT wired into runtime/UI/HTTP/agents. Every business query flows through a
// SINGLE secure execution path:
//
//   feature check → identity resolution → organization validation →
//   graph health check → capability/readiness check → BusinessGraphQueryService →
//   safe result mapping → correlated audit completion
//
// It NEVER: bypasses the query/traversal services, reads the store directly,
// duplicates query logic, opens a protected body, mutates a snapshot/node/edge,
// starts a subscription, computes totals before permission filtering, or trusts a
// caller-supplied viewer context / organizationId. On the OFF flag it builds
// NOTHING and every method returns a typed DISABLED result.
import { parseNodeId } from "../contracts/identity";
import type { GraphViewerContext } from "../contracts/security";
import type { GraphQueryContext } from "../traversal/types";
import { BUSINESS_QUERY_CAPABILITIES } from "../query/capabilities";
import { BUSINESS_QUERY_NAMES } from "../query/types";
import type {
  BusinessQueryName,
  BusinessQueryReadiness,
  BusinessQueryRequest,
  BusinessQueryResult,
} from "../query/types";
import type { BusinessGraphQueryService } from "../query/service";
import type { BusinessGraphFeaturePolicy } from "./flag";
import {
  BusinessGraphApplicationError,
  type BusinessGraphFacadeError,
  type BusinessGraphFacadeErrorCode,
  type BusinessGraphFacadeResultCode,
} from "./errors";
import type {
  BusinessGraphAccessContext,
  BusinessGraphAuditSink,
  BusinessGraphCapabilityResult,
  BusinessGraphCapabilityView,
  BusinessGraphFacadeAuditRecord,
  BusinessGraphFacadeOperation,
  BusinessGraphFacadeResult,
  BusinessGraphFacadeStatus,
  BusinessGraphIdentityResolver,
  BusinessGraphPermissionAdapter,
  BusinessGraphQueryArgs,
  BusinessGraphQueryView,
  BusinessGraphReadinessResult,
  BusinessGraphRequestContext,
  BusinessGraphResolvedIdentity,
  BusinessGraphStoreProvider,
  BusinessGraphTraversalStore,
} from "./types";
import {
  businessGraphQueryArgsSchema,
  businessGraphSessionIdentitySchema,
} from "./types";

/** Facade-level cap on subjects per request (a bounded, deterministic budget). */
export const MAX_FACADE_SUBJECTS = 200;

/** Keys a caller must NEVER supply — attempting any is an organization/context override. */
const FORBIDDEN_OVERRIDE_KEYS: readonly string[] = [
  "organizationId",
  "organization",
  "viewer",
  "viewerContext",
  "viewerClearance",
  "permissions",
  "permission",
  "actor",
  "clearance",
];

/** The explicit dependencies of the facade — all injected by the factory. */
export interface BusinessGraphFacadeDeps {
  featurePolicy: BusinessGraphFeaturePolicy;
  identityResolver: BusinessGraphIdentityResolver;
  permissionAdapter: BusinessGraphPermissionAdapter;
  storeProvider: BusinessGraphStoreProvider;
  auditSink: BusinessGraphAuditSink;
  /** unique execution-id provider — the SHARED source that gives every layer a distinct id */
  executionIdProvider: () => string;
  /** builds the business-query service over a lazily-opened store (composition owned by factory) */
  buildQueryService: (store: BusinessGraphTraversalStore) => BusinessGraphQueryService;
}

type QueryMethod = (
  request: BusinessQueryRequest,
  ctx: GraphQueryContext,
) => Promise<BusinessQueryResult>;

export class BusinessGraphApplicationFacade {
  private readonly deps: BusinessGraphFacadeDeps;
  private queryService: BusinessGraphQueryService | null = null;
  private storeOpened = false;
  private disposed = false;

  constructor(deps: BusinessGraphFacadeDeps) {
    // Pure field capture — NO store open, NO subscription, NO background work.
    this.deps = deps;
  }

  // =========================================================================
  // the 9 typed business queries (each is the SAME single secure path)
  // =========================================================================

  findCustomersNeedingFollowUp(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findCustomersNeedingFollowUp", ctx);
  }
  findUnansweredQuotations(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findUnansweredQuotations", ctx);
  }
  findRecurringServiceIssues(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findRecurringServiceIssues", ctx);
  }
  findDelayedEnrollments(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findDelayedEnrollments", ctx);
  }
  assessPrinterModelSupportImpact(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("assessPrinterModelSupportImpact", ctx);
  }
  findSupersededEvidence(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findSupersededEvidence", ctx);
  }
  findRecommendationConflicts(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findRecommendationConflicts", ctx);
  }
  findTasksFromApprovedRecommendations(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("findTasksFromApprovedRecommendations", ctx);
  }
  buildFullEvidencePath(ctx: BusinessGraphRequestContext): Promise<BusinessGraphFacadeResult> {
    return this.execute("buildFullEvidencePath", ctx);
  }

  // =========================================================================
  // status / capability / readiness
  // =========================================================================

  /** Safe status — NEVER touches the store or resolves identity. */
  getStatus(): BusinessGraphFacadeStatus {
    return {
      enabled: this.deps.featurePolicy.isEnabled(),
      constructed: this.queryService !== null,
      storeOpened: this.storeOpened,
      disposed: this.disposed,
    };
  }

  /** Honest capabilities for all 9 queries — no store read, no synthetic augmentation. */
  getCapabilities(ctx: BusinessGraphAccessContext): BusinessGraphCapabilityResult {
    const gate = this.gateAccess("getCapabilities", ctx);
    if (!gate.ok) {
      return { code: gate.code, ok: false, correlationId: ctx.correlationId, capabilities: [], error: gate.error };
    }
    const capabilities = this.capabilityViews();
    this.emitAccessAudit("getCapabilities", ctx.correlationId, gate.identity, "OK");
    return { code: "OK", ok: true, correlationId: ctx.correlationId, capabilities, error: null };
  }

  /** Honest readiness for all 9 queries — no store read, no synthetic augmentation. */
  getQueryReadiness(ctx: BusinessGraphAccessContext): BusinessGraphReadinessResult {
    const gate = this.gateAccess("getQueryReadiness", ctx);
    if (!gate.ok) {
      return { code: gate.code, ok: false, correlationId: ctx.correlationId, readiness: [], error: gate.error };
    }
    const readiness = this.capabilityViews();
    this.emitAccessAudit("getQueryReadiness", ctx.correlationId, gate.identity, "OK");
    return { code: "OK", ok: true, correlationId: ctx.correlationId, readiness, error: null };
  }

  // =========================================================================
  // lifecycle
  // =========================================================================

  /** Idempotent disposal — releases any lazily-opened store handle (no subscriptions exist). */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.queryService = null;
    if (this.storeOpened && this.deps.storeProvider.dispose !== undefined) {
      await this.deps.storeProvider.dispose();
    }
  }

  // =========================================================================
  // the single secure execution path
  // =========================================================================

  private async execute(
    query: BusinessQueryName,
    context: BusinessGraphRequestContext,
  ): Promise<BusinessGraphFacadeResult> {
    // (0) feature check — OFF ⇒ build NOTHING, resolve NOTHING, touch NO store.
    if (!this.deps.featurePolicy.isEnabled()) {
      return this.disabledResult(query, context.correlationId);
    }
    if (this.disposed) {
      return this.errorResult(query, context.correlationId, null, "INTERNAL_FAILURE", null);
    }

    const facadeExecutionId = this.deps.executionIdProvider();
    let identity: BusinessGraphResolvedIdentity | null = null;
    try {
      // (1) validate the crossing boundary (no override keys, well-formed args).
      const args = this.validateBoundary(context);

      // (2) identity resolution — the ONLY place a trusted context is produced.
      identity = this.resolveIdentity(context);

      // (3) organization validation — org comes ONLY from the resolver; every
      //     targeted node id must belong to that org (no cross-org probing).
      this.validateOrganization(args, identity.organizationId);

      // (3b) bounded budget.
      if ((args.subjects?.length ?? 0) > MAX_FACADE_SUBJECTS) {
        throw new BusinessGraphApplicationError("LIMIT_EXCEEDED");
      }

      // (4) lazily compose the query service (first real query only).
      const service = await this.ensureQueryService();

      // (5) build the trusted query context + run THROUGH the query service.
      const request = this.buildRequest(query, args);
      const queryCtx = this.buildQueryContext(context, identity);
      const method = service[query].bind(service) as QueryMethod;
      const result = await method(request, queryCtx);

      // (6) safe result mapping + (7) correlated audit completion.
      return this.completeFromResult(query, context.correlationId, facadeExecutionId, identity, result);
    } catch (err) {
      const code = err instanceof BusinessGraphApplicationError ? err.code : "INTERNAL_FAILURE";
      return this.errorResult(query, context.correlationId, facadeExecutionId, code, identity);
    }
  }

  // -------------------------------------------------------------------------
  // boundary validation
  // -------------------------------------------------------------------------

  /** Reject override keys and parse the args; return the SAFE args. */
  private validateBoundary(context: BusinessGraphRequestContext): BusinessGraphQueryArgs {
    // an override key at the context OR args level is an organization/context override.
    if (hasForbiddenKeys(context) || hasForbiddenKeys(context.args)) {
      throw new BusinessGraphApplicationError("ORGANIZATION_MISMATCH");
    }
    if (!businessGraphSessionIdentitySchema.safeParse(context.sessionIdentity).success) {
      throw new BusinessGraphApplicationError("UNAUTHENTICATED");
    }
    const parsed = businessGraphQueryArgsSchema.safeParse(context.args ?? {});
    if (!parsed.success) {
      // a malformed arg is an internal contract violation — safe, generic.
      throw new BusinessGraphApplicationError("INTERNAL_FAILURE");
    }
    return parsed.data;
  }

  /** Resolve the opaque session identity into a trusted identity (deny-by-default). */
  private resolveIdentity(context: BusinessGraphRequestContext): BusinessGraphResolvedIdentity {
    const resolution = this.deps.identityResolver.resolve(context.sessionIdentity);
    if (!resolution.ok) {
      throw new BusinessGraphApplicationError(resolution.reason);
    }
    return resolution.identity;
  }

  /** Every targeted node id must belong to the resolved organization. */
  private validateOrganization(args: BusinessGraphQueryArgs, organizationId: string): void {
    const ids: string[] = [];
    for (const s of args.subjects ?? []) ids.push(s);
    if (args.startNodeId !== undefined) ids.push(args.startNodeId);
    if (args.targetNodeId !== undefined) ids.push(args.targetNodeId);
    for (const id of ids) {
      let org: string;
      try {
        org = parseNodeId(id).organizationId;
      } catch {
        // a malformed id can never be attributed to this org — deny indistinguishably.
        throw new BusinessGraphApplicationError("ORGANIZATION_MISMATCH");
      }
      if (org !== organizationId) {
        throw new BusinessGraphApplicationError("ORGANIZATION_MISMATCH");
      }
    }
  }

  // -------------------------------------------------------------------------
  // composition (lazy — nothing built until the first real query)
  // -------------------------------------------------------------------------

  private async ensureQueryService(): Promise<BusinessGraphQueryService> {
    if (this.queryService !== null) return this.queryService;
    const store = await this.deps.storeProvider.getStore();
    this.storeOpened = true;
    const service = this.deps.buildQueryService(store);
    this.queryService = service;
    return service;
  }

  private buildRequest(query: BusinessQueryName, args: BusinessGraphQueryArgs): BusinessQueryRequest {
    const request: BusinessQueryRequest = { query };
    if (args.subjects !== undefined) request.subjects = args.subjects;
    if (args.startNodeId !== undefined) request.startNodeId = args.startNodeId;
    if (args.targetNodeId !== undefined) request.targetNodeId = args.targetNodeId;
    if (args.asOf !== undefined) request.asOf = args.asOf;
    if (args.thresholdDays !== undefined) request.thresholdDays = args.thresholdDays;
    if (args.policyVersion !== undefined) request.policyVersion = args.policyVersion;
    return request;
  }

  private buildQueryContext(
    context: BusinessGraphRequestContext,
    identity: BusinessGraphResolvedIdentity,
  ): GraphQueryContext {
    const viewer: GraphViewerContext = {
      organizationId: identity.organizationId,
      actor: identity.actor,
      ...(identity.role !== undefined ? { role: identity.role } : {}),
    };
    return {
      organizationId: identity.organizationId,
      viewer,
      viewerClearance: identity.viewerClearance,
      // the oracle is built by the injected permission adapter — the facade NEVER
      // fabricates permissions and the caller can NEVER supply one.
      permissions: this.deps.permissionAdapter.buildOracle(identity),
      allowStale: identity.allowStaleGraph,
      correlationId: context.correlationId,
    };
  }

  // -------------------------------------------------------------------------
  // result mapping + audit
  // -------------------------------------------------------------------------

  private completeFromResult(
    query: BusinessQueryName,
    correlationId: string,
    facadeExecutionId: string,
    identity: BusinessGraphResolvedIdentity,
    result: BusinessQueryResult,
  ): BusinessGraphFacadeResult {
    const code = mapResultCode(result);
    const audit: BusinessGraphFacadeAuditRecord = {
      facadeExecutionId,
      correlationId,
      operation: query,
      actorRef: identity.actor,
      organizationId: identity.organizationId,
      readiness: result.readiness,
      health: result.health,
      resultCount: result.counts.findings,
      truncated: result.truncated,
      resultCode: code,
      queryExecutionId: result.audit.executionId,
      traversalExecutionIds: result.traversalAudits.map((a) => a.executionId),
    };
    this.deps.auditSink.record(audit);
    if (code === "OK") {
      return {
        code,
        ok: true,
        correlationId,
        facadeExecutionId,
        query,
        view: toQueryView(result),
        audit,
        error: null,
      };
    }
    return {
      code,
      ok: false,
      correlationId,
      facadeExecutionId,
      query,
      view: null,
      audit,
      error: { code: code as BusinessGraphFacadeErrorCode, messageHe: new BusinessGraphApplicationError(code as BusinessGraphFacadeErrorCode).detailHe },
    };
  }

  private errorResult(
    query: BusinessQueryName,
    correlationId: string,
    facadeExecutionId: string | null,
    code: BusinessGraphFacadeErrorCode,
    identity: BusinessGraphResolvedIdentity | null,
  ): BusinessGraphFacadeResult {
    const audit: BusinessGraphFacadeAuditRecord = {
      facadeExecutionId: facadeExecutionId ?? "",
      correlationId,
      operation: query,
      actorRef: identity?.actor ?? null,
      organizationId: identity?.organizationId ?? null,
      readiness: null,
      health: null,
      resultCount: null,
      truncated: null,
      resultCode: code,
      queryExecutionId: null,
      traversalExecutionIds: [],
    };
    // audit the failure too (safe metadata only) — never when facadeExecutionId is null (disabled).
    if (facadeExecutionId !== null) this.deps.auditSink.record(audit);
    return {
      code,
      ok: false,
      correlationId,
      facadeExecutionId,
      query,
      view: null,
      audit: facadeExecutionId !== null ? audit : null,
      error: { code, messageHe: new BusinessGraphApplicationError(code).detailHe },
    };
  }

  private disabledResult(query: BusinessQueryName, correlationId: string): BusinessGraphFacadeResult {
    return {
      code: "DISABLED",
      ok: false,
      correlationId,
      facadeExecutionId: null,
      query,
      view: null,
      audit: null,
      error: { code: "DISABLED", messageHe: new BusinessGraphApplicationError("DISABLED").detailHe },
    };
  }

  // -------------------------------------------------------------------------
  // access-method gate (capabilities / readiness)
  // -------------------------------------------------------------------------

  private gateAccess(
    operation: "getCapabilities" | "getQueryReadiness",
    ctx: BusinessGraphAccessContext,
  ):
    | { ok: true; identity: BusinessGraphResolvedIdentity }
    | { ok: false; code: BusinessGraphFacadeResultCode; error: BusinessGraphFacadeError } {
    if (!this.deps.featurePolicy.isEnabled()) {
      return { ok: false, code: "DISABLED", error: safeErr("DISABLED") };
    }
    if (this.disposed) {
      return { ok: false, code: "INTERNAL_FAILURE", error: safeErr("INTERNAL_FAILURE") };
    }
    if (hasForbiddenKeys(ctx)) {
      return { ok: false, code: "ORGANIZATION_MISMATCH", error: safeErr("ORGANIZATION_MISMATCH") };
    }
    if (!businessGraphSessionIdentitySchema.safeParse(ctx.sessionIdentity).success) {
      return { ok: false, code: "UNAUTHENTICATED", error: safeErr("UNAUTHENTICATED") };
    }
    const resolution = this.deps.identityResolver.resolve(ctx.sessionIdentity);
    if (!resolution.ok) {
      return { ok: false, code: resolution.reason, error: safeErr(resolution.reason) };
    }
    void operation;
    return { ok: true, identity: resolution.identity };
  }

  private capabilityViews(): BusinessGraphCapabilityView[] {
    return BUSINESS_QUERY_NAMES.map((name) => {
      const cap = BUSINESS_QUERY_CAPABILITIES[name];
      return {
        query: name,
        baselineReadiness: cap.baselineReadiness,
        requiredEntities: cap.requiredEntities,
        missingFacts: cap.missingFacts,
      };
    });
  }

  private emitAccessAudit(
    operation: BusinessGraphFacadeOperation,
    correlationId: string,
    identity: BusinessGraphResolvedIdentity,
    code: BusinessGraphFacadeResultCode,
  ): void {
    this.deps.auditSink.record({
      facadeExecutionId: this.deps.executionIdProvider(),
      correlationId,
      operation,
      actorRef: identity.actor,
      organizationId: identity.organizationId,
      readiness: null,
      health: null,
      resultCount: null,
      truncated: null,
      resultCode: code,
      queryExecutionId: null,
      traversalExecutionIds: [],
    });
  }
}

// ---------------------------------------------------------------------------
// module-local pure helpers
// ---------------------------------------------------------------------------

function safeErr(code: BusinessGraphFacadeErrorCode): { code: BusinessGraphFacadeErrorCode; messageHe: string } {
  return new BusinessGraphApplicationError(code).toSafeError();
}

function hasForbiddenKeys(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") return false;
  const record = obj as Record<string, unknown>;
  return FORBIDDEN_OVERRIDE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(record, k));
}

/** Map a (security-filtered) business-query result to a safe facade code. */
function mapResultCode(result: BusinessQueryResult): BusinessGraphFacadeResultCode {
  if (result.ok) return "OK";
  switch (result.refusalReason) {
    case "STALE_NOT_AUTHORIZED":
      return "STALE_NOT_AUTHORIZED";
    case "ORG_CONTEXT_MISMATCH":
      return "ORGANIZATION_MISMATCH";
    case "GRAPH_UNAVAILABLE":
      return result.health === "MISSING" ? "GRAPH_MISSING" : "GRAPH_UNHEALTHY";
    case "INVALID_CONTEXT":
      return "INTERNAL_FAILURE";
    case "INVALID_REQUEST":
      return result.readiness === "UNSUPPORTED" ? "QUERY_NOT_READY" : "INTERNAL_FAILURE";
    default:
      return mapByReadiness(result.readiness);
  }
}

function mapByReadiness(readiness: BusinessQueryReadiness): BusinessGraphFacadeResultCode {
  if (readiness === "BLOCKED_BY_HEALTH") return "GRAPH_UNHEALTHY";
  if (readiness === "BLOCKED_BY_PERMISSION") return "FORBIDDEN";
  if (readiness === "UNSUPPORTED") return "QUERY_NOT_READY";
  return "INTERNAL_FAILURE";
}

/** Project a business-query result onto the safe facade view (no unsafe fields). */
function toQueryView(result: BusinessQueryResult): BusinessGraphQueryView {
  return {
    query: result.query,
    organizationId: result.organizationId,
    snapshotId: result.snapshotId,
    health: result.health,
    stale: result.stale,
    readiness: result.readiness,
    capability: result.capability,
    policyVersion: result.policy.policyVersion,
    findings: result.findings,
    counts: result.counts,
    truncated: result.truncated,
    missingFacts: result.missingFacts,
  };
}

/** A stable array of the 9 approved business-query names (for callers/tests). */
export const BUSINESS_GRAPH_FACADE_QUERIES: readonly BusinessQueryName[] = BUSINESS_QUERY_NAMES;
