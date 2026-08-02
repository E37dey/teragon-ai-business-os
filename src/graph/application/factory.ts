// TERAGON Business Graph — Phase 8 APPLICATION-FACADE composition root.
// ---------------------------------------------------------------------------
// BusinessGraphFacadeFactory is the ONE place the facade's dependencies are
// created and wired. It follows the existing DI conventions: NO second service
// locator, NO module-level mutable singletons, NO hidden global identity, NO
// hidden `Date.now`, and NO automatic background work on import. Every dependency
// is injected EXPLICITLY. Construction builds NOTHING that touches the graph:
// when the flag is OFF the returned facade never opens a store or IndexedDB — the
// store provider is invoked ONLY on the first real query while enabled.
import { BusinessGraphQueryService } from "../query/service";
import { BusinessGraphTraversalService } from "../traversal/service";
import { createFeaturePolicy } from "./flag";
import { BusinessGraphApplicationFacade, type BusinessGraphFacadeDeps } from "./facade";
import type {
  BusinessGraphAuditSink,
  BusinessGraphClock,
  BusinessGraphIdentityResolver,
  BusinessGraphPermissionAdapter,
  BusinessGraphStoreProvider,
  BusinessGraphTraversalStore,
} from "./types";

/**
 * Builds the business-query service over a lazily-opened store. The default is
 * the REAL composition (store → traversal → business queries), sharing the one
 * injected execution-id provider so every layer gets a DISTINCT execution id.
 * Tests may inject an instrumented factory to prove the facade routes ONLY through
 * the query service (never bypassing to the store/traversal).
 */
export type BusinessGraphQueryServiceFactory = (
  store: BusinessGraphTraversalStore,
  ctx: { clock: BusinessGraphClock; executionIdProvider: () => string },
) => BusinessGraphQueryService;

export interface BusinessGraphFacadeFactoryConfig {
  identityResolver: BusinessGraphIdentityResolver;
  permissionAdapter: BusinessGraphPermissionAdapter;
  storeProvider: BusinessGraphStoreProvider;
  auditSink: BusinessGraphAuditSink;
  clock: BusinessGraphClock;
  /** unique execution-id provider (default Web Crypto randomUUID — never a key) */
  executionIdProvider?: () => string;
  /** test-only feature override; production passes nothing (default OFF) */
  featureOverride?: boolean;
  /** advanced/test seam for the query-service composition (default = real) */
  queryServiceFactory?: BusinessGraphQueryServiceFactory;
}

/** The default REAL composition: store → traversal → business-query service. */
export const defaultQueryServiceFactory: BusinessGraphQueryServiceFactory = (store, ctx) => {
  const traversal = new BusinessGraphTraversalService(store, {
    now: ctx.clock.nowMs,
    asOf: ctx.clock.nowIso,
    executionIdProvider: ctx.executionIdProvider,
  });
  return new BusinessGraphQueryService(traversal, {
    now: ctx.clock.nowIso,
    executionIdProvider: ctx.executionIdProvider,
  });
};

export class BusinessGraphFacadeFactory {
  /**
   * Create a facade from explicit dependencies. Building the returned object does
   * NO graph work: with the flag OFF it stays entirely inert; even with the flag
   * ON the store/query/traversal services are constructed lazily on the first
   * business query, never here.
   */
  static create(config: BusinessGraphFacadeFactoryConfig): BusinessGraphApplicationFacade {
    const featurePolicy = createFeaturePolicy(config.featureOverride);
    const executionIdProvider = config.executionIdProvider ?? (() => crypto.randomUUID());
    const queryServiceFactory = config.queryServiceFactory ?? defaultQueryServiceFactory;
    const buildQueryService = (store: BusinessGraphTraversalStore): BusinessGraphQueryService =>
      queryServiceFactory(store, { clock: config.clock, executionIdProvider });

    const deps: BusinessGraphFacadeDeps = {
      featurePolicy,
      identityResolver: config.identityResolver,
      permissionAdapter: config.permissionAdapter,
      storeProvider: config.storeProvider,
      auditSink: config.auditSink,
      executionIdProvider,
      buildQueryService,
    };
    return new BusinessGraphApplicationFacade(deps);
  }
}
