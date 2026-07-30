// TERAGON Business Graph — Phase 8 APPLICATION-FACADE test helpers.
// Deterministic fakes for the injected boundary: a scripted identity resolver, a
// permission adapter that honors the resolved identity, a recording audit sink, a
// recording store provider, a fixed clock + counter execution-id provider, a spy
// query service, and a facade builder. NO real auth, NO real permissions — every
// dependency is an explicit, deterministic fake.
import { vi } from "vitest";
import {
  BUSINESS_QUERY_CAPABILITIES,
  BusinessGraphFacadeFactory,
  type BusinessGraphApplicationFacade,
  type BusinessGraphAuditSink,
  type BusinessGraphClock,
  type BusinessGraphFacadeAuditRecord,
  type BusinessGraphIdentityResolution,
  type BusinessGraphIdentityResolver,
  type BusinessGraphPermissionAdapter,
  type BusinessGraphQueryArgs,
  type BusinessGraphRequestContext,
  type BusinessGraphResolvedIdentity,
  type BusinessGraphSessionIdentity,
  type BusinessGraphStoreProvider,
  type BusinessGraphTraversalStore,
  type BusinessQueryName,
  type BusinessQueryRequest,
  type BusinessQueryResult,
  type GraphQueryContext,
  type BusinessGraphQueryService,
} from "@/graph";
import { VALID_ORG } from "../fixtures/validFixture";

export { VALID_ORG };
export { nid, synthNode, synthEdge, synthSnapshot, healthyStore, storeWithHealth, StubStore, makeHealth } from "../traversal/helpers";
export { contradictSnapshot, recurringServiceSnapshot } from "../query/helpers";

// ---------------------------------------------------------------------------
// deterministic clock + execution ids
// ---------------------------------------------------------------------------

export const FIXED_ISO = "2026-07-30T00:00:00.000Z";
export const CLOCK: BusinessGraphClock = { nowIso: () => FIXED_ISO, nowMs: () => 0 };

/** A distinct-per-call counter execution-id provider (x-1, x-2, …). */
export function counterExec(prefix = "x"): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

export function ceoIdentity(over: Partial<BusinessGraphResolvedIdentity> = {}): BusinessGraphResolvedIdentity {
  return {
    actor: { kind: "HUMAN", userId: "u-tzachi" },
    organizationId: VALID_ORG,
    role: "ceo",
    viewerClearance: "מוגבל",
    allowedEntityDomains: null,
    allowStaleGraph: false,
    ...over,
  };
}

/** A resolver from an explicit resolve function. */
export function resolverFrom(
  fn: (s: BusinessGraphSessionIdentity) => BusinessGraphIdentityResolution,
): BusinessGraphIdentityResolver {
  return { resolve: fn };
}

/** A resolver that always returns `identity` (ignores the opaque session ref). */
export function fixedResolver(identity: BusinessGraphResolvedIdentity): BusinessGraphIdentityResolver {
  return resolverFrom(() => ({ ok: true, identity }));
}

/** A resolver that denies with the given reason. */
export function denyResolver(reason: "UNAUTHENTICATED" | "IDENTITY_AMBIGUOUS"): BusinessGraphIdentityResolver {
  return resolverFrom(() => ({ ok: false, reason }));
}

// ---------------------------------------------------------------------------
// permission adapter fakes
// ---------------------------------------------------------------------------

/** Allow-all reads/domains; stale-graph follows the resolved identity's grant. */
export function allowAllAdapter(): BusinessGraphPermissionAdapter {
  return {
    buildOracle: (identity) => ({
      canReadEntity: () => true,
      agentDomainAllowed: () => true,
      canUseStaleGraph: () => identity.allowStaleGraph,
    }),
  };
}

/** Deny specific node ids (hidden entities); everything else allowed. */
export function denyNodeAdapter(ids: ReadonlySet<string>): BusinessGraphPermissionAdapter {
  return {
    buildOracle: (identity) => ({
      canReadEntity: (_v, _t, node) => !ids.has(node.id),
      agentDomainAllowed: () => true,
      canUseStaleGraph: () => identity.allowStaleGraph,
    }),
  };
}

// ---------------------------------------------------------------------------
// recording audit sink
// ---------------------------------------------------------------------------

export interface RecordingSink {
  sink: BusinessGraphAuditSink;
  records: BusinessGraphFacadeAuditRecord[];
}

export function recordingSink(): RecordingSink {
  const records: BusinessGraphFacadeAuditRecord[] = [];
  return { sink: { record: (r) => void records.push(r) }, records };
}

// ---------------------------------------------------------------------------
// recording store provider
// ---------------------------------------------------------------------------

export interface RecordingStoreProvider {
  provider: BusinessGraphStoreProvider;
  getStoreCalls: () => number;
  disposeCalls: () => number;
}

/** Wrap a store surface, counting getStore/dispose invocations. */
export function recordingStoreProvider(store: BusinessGraphTraversalStore): RecordingStoreProvider {
  let getCalls = 0;
  let disposeCalls = 0;
  return {
    provider: {
      getStore: () => {
        getCalls += 1;
        return Promise.resolve(store);
      },
      dispose: () => void (disposeCalls += 1),
    },
    getStoreCalls: () => getCalls,
    disposeCalls: () => disposeCalls,
  };
}

// ---------------------------------------------------------------------------
// spy query service (proves the facade delegates ONLY through the query service)
// ---------------------------------------------------------------------------

const QUERY_NAMES = Object.keys(BUSINESS_QUERY_CAPABILITIES) as BusinessQueryName[];

/** A minimal, type-complete OK result for a query (no traversal audits). */
export function cannedResult(query: BusinessQueryName): BusinessQueryResult {
  return {
    ok: true,
    query,
    organizationId: VALID_ORG,
    snapshotId: "snap-canned",
    registryVersion: "core-v2",
    health: "HEALTHY",
    stale: false,
    readiness: "SUPPORTED",
    capability: BUSINESS_QUERY_CAPABILITIES[query],
    policy: { policyVersion: "business-query-v1", asOf: FIXED_ISO, thresholdDays: null, cutoff: null, cutoffMode: "calendar-day" },
    findings: [],
    counts: { findings: 0, entities: 0 },
    truncated: false,
    missingFacts: [],
    refusalReason: null,
    audit: {
      executionId: `qexec-${query}`,
      query,
      organizationId: VALID_ORG,
      actorKind: "HUMAN",
      policyVersion: "business-query-v1",
      asOf: FIXED_ISO,
      thresholdDays: null,
      cutoff: null,
      readiness: "SUPPORTED",
      snapshotId: "snap-canned",
      health: "HEALTHY",
      stale: false,
      subjectCount: 0,
      resultCounts: { findings: 0, entities: 0 },
      truncated: false,
      traversalExecutionIds: [],
      safeReason: null,
    },
    traversalAudits: [],
  };
}

export interface SpyQueryService {
  service: BusinessGraphQueryService;
  calls: () => Record<string, number>;
}

/** A spy query service whose 9 methods return canned results and count calls,
 *  WITHOUT ever touching a store (proving no store/traversal bypass in the facade). */
export function spyQueryService(): SpyQueryService {
  const calls: Record<string, number> = {};
  const obj: Record<string, unknown> = {};
  for (const name of QUERY_NAMES) {
    calls[name] = 0;
    obj[name] = vi.fn((request: BusinessQueryRequest, _ctx: GraphQueryContext) => {
      calls[name] = (calls[name] ?? 0) + 1;
      return Promise.resolve(cannedResult(request.query));
    });
  }
  return { service: obj as unknown as BusinessGraphQueryService, calls: () => calls };
}

// ---------------------------------------------------------------------------
// facade builder
// ---------------------------------------------------------------------------

export interface BuildFacadeOptions {
  enabled?: boolean;
  identity?: BusinessGraphResolvedIdentity;
  resolver?: BusinessGraphIdentityResolver;
  permissionAdapter?: BusinessGraphPermissionAdapter;
  storeProvider?: BusinessGraphStoreProvider;
  sink?: BusinessGraphAuditSink;
  exec?: () => string;
  store?: BusinessGraphTraversalStore;
  spy?: SpyQueryService;
}

/** Build a facade from deterministic fakes; sensible defaults for every dep. */
export function buildFacade(opts: BuildFacadeOptions = {}): BusinessGraphApplicationFacade {
  const resolver = opts.resolver ?? fixedResolver(opts.identity ?? ceoIdentity());
  const storeProvider =
    opts.storeProvider ??
    recordingStoreProvider(opts.store ?? emptyStore()).provider;
  return BusinessGraphFacadeFactory.create({
    identityResolver: resolver,
    permissionAdapter: opts.permissionAdapter ?? allowAllAdapter(),
    storeProvider,
    auditSink: opts.sink ?? recordingSink().sink,
    clock: CLOCK,
    executionIdProvider: opts.exec ?? counterExec(),
    featureOverride: opts.enabled ?? true,
    ...(opts.spy ? { queryServiceFactory: () => opts.spy!.service } : {}),
  });
}

/** A store surface that returns no snapshot + MISSING health (never actually read in OFF tests). */
export function emptyStore(): BusinessGraphTraversalStore {
  return {
    getActiveSnapshot: () => Promise.resolve(null),
    getHealth: (organizationId: string) =>
      Promise.resolve({
        organizationId,
        state: "MISSING",
        checkedAt: FIXED_ISO,
        activeSnapshotId: null,
        checksumVerified: false,
        findings: [],
      }),
  };
}

/** A request context carrying an opaque session ref + correlation id + query args. */
export function reqCtx(
  correlationId: string,
  args: BusinessGraphQueryArgs = {},
  sessionRef = "sess-1",
): BusinessGraphRequestContext {
  return { sessionIdentity: { sessionRef }, correlationId, args };
}
