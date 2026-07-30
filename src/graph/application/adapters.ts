// TERAGON Business Graph — Phase 8 APPLICATION-FACADE real-adapter boundary.
// ---------------------------------------------------------------------------
// Thin PRODUCTION adapter implementations against existing app concepts. They
// define how the facade would talk to the real world — BUT they stay UNREGISTERED
// while the flag is OFF (nothing here is wired into runtime). They do NOT rewrite
// the product authorization system and do NOT fabricate production permissions:
// the permission adapter merely translates the resolver's already-decided facts
// (allowed entity domains, stale-graph grant) into a deny-by-default oracle.
// Tests use their own deterministic fakes instead of these.
import type { GraphEntityType } from "../contracts/identity";
import type { BusinessGraphNode } from "../contracts/node";
import type { GraphViewerContext } from "../contracts/security";
import type { GraphIndexHealthState } from "../store/contracts";
import { IndexedDBGraphIndexStore } from "../store/indexeddbStore";
import type { GraphPermissionOracle } from "../traversal/types";
import type {
  BusinessGraphAuditSink,
  BusinessGraphClock,
  BusinessGraphIdentityResolution,
  BusinessGraphIdentityResolver,
  BusinessGraphPermissionAdapter,
  BusinessGraphResolvedIdentity,
  BusinessGraphSessionIdentity,
  BusinessGraphStoreProvider,
  BusinessGraphTraversalStore,
} from "./types";

// ---------------------------------------------------------------------------
// clock (production uses the host clock — the facade layers stay Date-free)
// ---------------------------------------------------------------------------

/** A production clock backed by the host `Date`. Injected, never hidden. */
export function createSystemClock(): BusinessGraphClock {
  return {
    nowIso: () => new Date().toISOString(),
    nowMs: () => Date.now(),
  };
}

// ---------------------------------------------------------------------------
// identity resolver (UNREGISTERED — the app has no real auth yet)
// ---------------------------------------------------------------------------

/**
 * The production identity resolver placeholder. The app has NO real auth (single
 * demo CEO), so a trustworthy production resolver does not yet exist. This one is
 * deny-by-default (always UNAUTHENTICATED) and stays UNREGISTERED while the flag
 * is OFF. It NEVER fabricates a demo admin identity. A real deployment replaces it
 * with a session-backed resolver.
 */
export class UnavailableIdentityResolver implements BusinessGraphIdentityResolver {
  resolve(_sessionIdentity: BusinessGraphSessionIdentity): BusinessGraphIdentityResolution {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }
}

// ---------------------------------------------------------------------------
// permission adapter (deny-by-default; translates resolver facts only)
// ---------------------------------------------------------------------------

/**
 * A deny-by-default permission adapter that translates the resolved identity's
 * allowed-entity-domains window and stale-graph grant into a `GraphPermissionOracle`.
 * It fabricates NO permissions of its own and rewrites NO product authorization —
 * clearance/sensitivity/authority/approval gates remain the traversal layer's job.
 */
export class DomainWindowPermissionAdapter implements BusinessGraphPermissionAdapter {
  buildOracle(identity: BusinessGraphResolvedIdentity): GraphPermissionOracle {
    const domains = identity.allowedEntityDomains;
    const inDomain = (entityType: GraphEntityType): boolean =>
      domains === null || domains.includes(entityType);
    const allowStale = identity.allowStaleGraph;
    return {
      canReadEntity: (_viewer: GraphViewerContext, entityType: GraphEntityType, _node: BusinessGraphNode): boolean =>
        inDomain(entityType),
      agentDomainAllowed: (_viewer: GraphViewerContext, entityType: GraphEntityType, _node: BusinessGraphNode): boolean =>
        inDomain(entityType),
      canUseStaleGraph: (_viewer: GraphViewerContext, _health: GraphIndexHealthState): boolean => allowStale,
    };
  }
}

// ---------------------------------------------------------------------------
// audit sink (no-op production default; a real deployment forwards elsewhere)
// ---------------------------------------------------------------------------

/** A no-op audit sink — emits nowhere. It NEVER writes the canonical AuditEvent repo. */
export function createNoopAuditSink(): BusinessGraphAuditSink {
  return { record: () => undefined };
}

// ---------------------------------------------------------------------------
// store provider (lazy; NEVER opened while the flag is OFF)
// ---------------------------------------------------------------------------

/** Wrap an already-built read-only store surface as a provider (for wiring/tests). */
export function createStoreProvider(store: BusinessGraphTraversalStore): BusinessGraphStoreProvider {
  return { getStore: () => Promise.resolve(store) };
}

/**
 * A production store provider that lazily constructs the IndexedDB-backed index
 * store on first use. It is NEVER constructed while the flag is OFF and opens NO
 * IndexedDB at facade construction. Disposal drops the cached handle (idempotent).
 */
export class IndexedDbStoreProvider implements BusinessGraphStoreProvider {
  private readonly nowIso: () => string;
  private store: IndexedDBGraphIndexStore | null = null;

  constructor(clock: BusinessGraphClock) {
    // capture only the ISO clock — NO IndexedDB open here.
    this.nowIso = clock.nowIso;
  }

  getStore(): Promise<BusinessGraphTraversalStore> {
    if (this.store === null) {
      this.store = new IndexedDBGraphIndexStore({ now: this.nowIso });
    }
    return Promise.resolve(this.store);
  }

  dispose(): void {
    this.store = null;
  }
}
