// TERAGON Business Graph — Phase 10 RUNTIME composition root + lifecycle.
// ---------------------------------------------------------------------------
// ONE internal composition that wires (via the existing Phase-8
// `BusinessGraphFacadeFactory`) a fresh store provider + traversal + query +
// facade around the runtime identity resolver, permission adapter, and audit
// adapter. It is LAZY: constructing the composition builds NO facade, opens NO
// store, and starts NO background work; a facade is built only when an
// authenticated context ACQUIRES one. There is NO module-level mutable singleton
// and NO `window` global — a caller holds the composition explicitly.
//
// The `RuntimeBusinessGraphLifecycle` owns AT MOST ONE facade at a time, keyed by
// the authenticated context (session + user + organization + role). Any change to
// that key — user switch, organization switch, role/permission change, logout —
// DISPOSES the previous facade (and its store context) before building a new one,
// so no query ever runs with a prior session's store or permissions.
import { BusinessGraphFacadeFactory } from "../application/factory";
import type { BusinessGraphApplicationFacade } from "../application/facade";
import { createFeaturePolicy, type BusinessGraphFeaturePolicy } from "../application/flag";
import type {
  BusinessGraphAccessContext,
  BusinessGraphCapabilityResult,
  BusinessGraphClock,
  BusinessGraphPermissionAdapter,
  BusinessGraphReadinessResult,
  BusinessGraphRequestContext,
  BusinessGraphResolvedIdentity,
  BusinessGraphSessionIdentity,
  BusinessGraphStoreProvider,
} from "../application/types";
import type { BusinessQueryName } from "../query/types";
import {
  BusinessGraphRuntimeAccessPolicy,
  type RuntimeAccessDecision,
} from "./accessPolicy";
import { roleMayRunQuery } from "./authorizationMap";
import {
  RuntimeBusinessGraphAuditAdapter,
  resolveQueryOutcome,
  resolveStatusOutcome,
  type RuntimeQueryOutcome,
  type RuntimeStatusOutcome,
} from "./audit";
import {
  RuntimeBusinessGraphIdentityResolver,
  type ActiveUserLookup,
  type TrustedSessionSource,
} from "./identity";
import { RuntimeBusinessGraphPermissionAdapter } from "./permissionAdapter";
import {
  createRolloutPolicy,
  type BusinessGraphRuntimeRolloutPolicy,
} from "./rollout";

// ---------------------------------------------------------------------------
// composition
// ---------------------------------------------------------------------------

export interface RuntimeCompositionOptions {
  sessionSource: TrustedSessionSource;
  userLookup: ActiveUserLookup;
  /** builds a FRESH store provider per facade — the org-isolation seam */
  storeProviderFactory: () => BusinessGraphStoreProvider;
  clock: BusinessGraphClock;
  auditAdapter?: RuntimeBusinessGraphAuditAdapter;
  permissionAdapter?: BusinessGraphPermissionAdapter;
  /** shared, distinct-per-call execution id source (default Web Crypto randomUUID) */
  executionIdProvider?: () => string;
  /** test-only feature override; production passes nothing (default OFF) */
  featureOverride?: boolean;
  /** test-only rollout override; production passes nothing (default NOT approved) */
  rolloutOverride?: boolean;
}

/**
 * The runtime composition root. Building it does NO graph work; it only assembles
 * the stateless resolver / policy / adapters. A facade is produced lazily by the
 * lifecycle, one per authenticated context.
 */
export class RuntimeBusinessGraphComposition {
  readonly identityResolver: RuntimeBusinessGraphIdentityResolver;
  readonly accessPolicy: BusinessGraphRuntimeAccessPolicy;
  readonly auditAdapter: RuntimeBusinessGraphAuditAdapter;
  readonly featurePolicy: BusinessGraphFeaturePolicy;
  readonly rolloutPolicy: BusinessGraphRuntimeRolloutPolicy;

  private readonly permissionAdapter: BusinessGraphPermissionAdapter;
  private readonly storeProviderFactory: () => BusinessGraphStoreProvider;
  private readonly clock: BusinessGraphClock;
  private readonly executionIdProvider: () => string;
  private readonly featureOverride?: boolean;

  constructor(options: RuntimeCompositionOptions) {
    this.identityResolver = new RuntimeBusinessGraphIdentityResolver({
      sessionSource: options.sessionSource,
      userLookup: options.userLookup,
    });
    this.featurePolicy = createFeaturePolicy(options.featureOverride);
    this.rolloutPolicy = createRolloutPolicy(options.rolloutOverride);
    this.accessPolicy = new BusinessGraphRuntimeAccessPolicy({
      featurePolicy: this.featurePolicy,
      rolloutPolicy: this.rolloutPolicy,
      identityResolver: this.identityResolver,
    });
    this.auditAdapter = options.auditAdapter ?? new RuntimeBusinessGraphAuditAdapter();
    this.permissionAdapter = options.permissionAdapter ?? new RuntimeBusinessGraphPermissionAdapter();
    this.storeProviderFactory = options.storeProviderFactory;
    this.clock = options.clock;
    this.executionIdProvider = options.executionIdProvider ?? (() => crypto.randomUUID());
    this.featureOverride = options.featureOverride;
  }

  /**
   * Build ONE facade over a FRESH store provider. Called ONLY by the lifecycle when
   * an authenticated context acquires access — never on import, never eagerly. The
   * fresh store provider guarantees a different organization can never reuse a prior
   * org's store handle.
   */
  buildFacade(): BusinessGraphApplicationFacade {
    return BusinessGraphFacadeFactory.create({
      identityResolver: this.identityResolver,
      permissionAdapter: this.permissionAdapter,
      storeProvider: this.storeProviderFactory(),
      auditSink: this.auditAdapter,
      clock: this.clock,
      executionIdProvider: this.executionIdProvider,
      ...(this.featureOverride !== undefined ? { featureOverride: this.featureOverride } : {}),
    });
  }

  /** Create a fresh lifecycle bound to this composition (no shared mutable state). */
  createLifecycle(): RuntimeBusinessGraphLifecycle {
    return new RuntimeBusinessGraphLifecycle(this);
  }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

/** The authenticated context a facade is bound to. */
export interface AuthenticatedContextKey {
  sessionRef: string;
  userId: string;
  organizationId: string;
  role: string;
}

function actorUserId(identity: BusinessGraphResolvedIdentity): string {
  return identity.actor.kind === "HUMAN" ? identity.actor.userId : `#${identity.actor.kind}`;
}

function contextKeyOf(sessionRef: string, identity: BusinessGraphResolvedIdentity): string {
  return [sessionRef, actorUserId(identity), identity.organizationId, identity.role ?? ""].join("::");
}

/** The outcome of acquiring a facade for an authenticated context. */
export type RuntimeAcquisition =
  | {
      ok: true;
      facade: BusinessGraphApplicationFacade;
      contextKey: string;
      identity: BusinessGraphResolvedIdentity;
      /** true when the SAME context reused the existing facade instance */
      reused: boolean;
    }
  | { ok: false; decision: RuntimeAccessDecision; reasonHe: string };

/** The outcome of running a business query through the runtime (with audit gate). */
export type RuntimeQueryExecution =
  | { ok: true; outcome: RuntimeQueryOutcome; contextKey: string }
  | { ok: false; decision: RuntimeAccessDecision; reasonHe: string };

/** The outcome of a low-risk status call through the runtime (fail-safe audit gate). */
export type RuntimeStatusExecution<T> =
  | { ok: true; outcome: RuntimeStatusOutcome<T>; contextKey: string }
  | { ok: false; decision: RuntimeAccessDecision; reasonHe: string };

interface CurrentFacade {
  key: string;
  facade: BusinessGraphApplicationFacade;
  identity: BusinessGraphResolvedIdentity;
}

export interface AcquireOptions {
  /** the org context the caller believes it operates in; must match the resolved org */
  requestedOrganizationId?: string | null;
}

/**
 * Owns at most ONE facade, keyed by the authenticated context. Re-resolves identity
 * on every acquire (so a role/permission change is detected and forces a fresh
 * facade), disposes the previous facade whenever the identity/org/role changes, and
 * disposes on logout. Never exposes the facade via a global.
 */
export class RuntimeBusinessGraphLifecycle {
  private readonly composition: RuntimeBusinessGraphComposition;
  private current: CurrentFacade | null = null;
  private disposed = false;

  constructor(composition: RuntimeBusinessGraphComposition) {
    this.composition = composition;
  }

  /** True once this lifecycle has been permanently disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** The current authenticated context key (null when no facade is held). */
  get currentContextKey(): string | null {
    return this.current?.key ?? null;
  }

  /**
   * Acquire a facade for the trusted context behind `sessionIdentity`. Builds
   * NOTHING when access is denied; reuses the existing facade for the SAME context;
   * disposes the previous facade when the context changes (user / org / role) or
   * when the identity is now denied (e.g. permission revocation).
   */
  async acquire(
    sessionIdentity: BusinessGraphSessionIdentity,
    options: AcquireOptions = {},
  ): Promise<RuntimeAcquisition> {
    if (this.disposed) {
      return { ok: false, decision: "GRAPH_UNAVAILABLE", reasonHe: "משאבי הגרף שוחררו" };
    }
    // identity-level gate ONLY (no per-query capability, no health) — this governs
    // the facade lifecycle. Per-query capability + health are checked in runQuery.
    const evaluation = this.composition.accessPolicy.evaluate({
      sessionIdentity,
      ...(options.requestedOrganizationId !== undefined
        ? { requestedOrganizationId: options.requestedOrganizationId }
        : {}),
    });
    if (evaluation.decision !== "ENABLED" || evaluation.identity === null) {
      // a now-denied identity must never keep a live facade with stale permissions.
      await this.disposeCurrent();
      return { ok: false, decision: evaluation.decision, reasonHe: evaluation.reasonHe };
    }

    const identity = evaluation.identity;
    const key = contextKeyOf(sessionIdentity.sessionRef, identity);
    if (this.current !== null) {
      if (this.current.key === key) {
        return { ok: true, facade: this.current.facade, contextKey: key, identity, reused: true };
      }
      // context changed (user / org / role) ⇒ dispose the previous facade + store.
      await this.disposeCurrent();
    }
    const facade = this.composition.buildFacade();
    this.current = { key, facade, identity };
    return { ok: true, facade, contextKey: key, identity, reused: false };
  }

  /**
   * Run a business query end-to-end: acquire the facade, enforce the per-query
   * graph capability, execute, then apply the fail-CLOSED audit gate (a failed
   * durable audit write suppresses the data for a sensitive query).
   */
  async runQuery(
    query: BusinessQueryName,
    requestContext: BusinessGraphRequestContext,
    options: AcquireOptions = {},
  ): Promise<RuntimeQueryExecution> {
    const acquisition = await this.acquire(requestContext.sessionIdentity, options);
    if (!acquisition.ok) return acquisition;

    // per-query capability — does NOT dispose the facade (the role keeps graph
    // access for its OTHER permitted queries).
    if (!(acquisition.identity.role !== undefined && roleMayRunQuery(acquisition.identity.role, query))) {
      return { ok: false, decision: "CAPABILITY_DENIED", reasonHe: "אין לתפקיד יכולת גרף לשאילתה זו" };
    }

    const method = acquisition.facade[query].bind(acquisition.facade);
    const result = await method(requestContext);
    const auditState = this.composition.auditAdapter.writeState(result.facadeExecutionId);
    const outcome = resolveQueryOutcome(result, auditState);
    return { ok: true, outcome, contextKey: acquisition.contextKey };
  }

  /** Run `getCapabilities` through the fail-SAFE audit gate (always released, marked). */
  async getCapabilities(
    accessContext: BusinessGraphAccessContext,
    options: AcquireOptions = {},
  ): Promise<RuntimeStatusExecution<BusinessGraphCapabilityResult>> {
    const acquisition = await this.acquire(accessContext.sessionIdentity, options);
    if (!acquisition.ok) return acquisition;
    const result = acquisition.facade.getCapabilities(accessContext);
    const auditState = this.composition.auditAdapter.writeState(this.lastStatusExecId(accessContext));
    return { ok: true, outcome: resolveStatusOutcome(result, auditState), contextKey: acquisition.contextKey };
  }

  /** Run `getQueryReadiness` through the fail-SAFE audit gate. */
  async getQueryReadiness(
    accessContext: BusinessGraphAccessContext,
    options: AcquireOptions = {},
  ): Promise<RuntimeStatusExecution<BusinessGraphReadinessResult>> {
    const acquisition = await this.acquire(accessContext.sessionIdentity, options);
    if (!acquisition.ok) return acquisition;
    const result = acquisition.facade.getQueryReadiness(accessContext);
    const auditState = this.composition.auditAdapter.writeState(this.lastStatusExecId(accessContext));
    return { ok: true, outcome: resolveStatusOutcome(result, auditState), contextKey: acquisition.contextKey };
  }

  /** Dispose the current facade (logout) but keep the lifecycle usable for re-login. */
  async logout(): Promise<void> {
    await this.disposeCurrent();
  }

  /** Alias for logout — invalidate the current authenticated context. */
  invalidate(): Promise<void> {
    return this.disposeCurrent();
  }

  /** Permanently dispose the lifecycle and its facade. Idempotent. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.disposeCurrent();
    this.disposed = true;
  }

  private async disposeCurrent(): Promise<void> {
    if (this.current === null) return;
    const facade = this.current.facade;
    this.current = null;
    await facade.dispose();
  }

  /** The most-recent status-call execution id for this correlation, for the audit gate. */
  private lastStatusExecId(accessContext: BusinessGraphAccessContext): string | null {
    const last = this.composition.auditAdapter.lastEntry();
    if (last === null) return null;
    return last.correlationId === accessContext.correlationId ? last.facadeExecutionId : null;
  }
}
