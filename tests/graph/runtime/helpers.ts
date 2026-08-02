// TERAGON Business Graph — Phase 10 RUNTIME test helpers.
// Deterministic fakes for the trusted-session boundary: an in-memory trusted
// session source, an in-memory active-user lookup, a fixed clock + counter
// execution-id provider, a recording store provider, and composition builders.
// NO real auth — every trusted session is an explicit deterministic fake.
import {
  RuntimeBusinessGraphAuditAdapter,
  RuntimeBusinessGraphComposition,
  createStoreProvider,
  type ActiveUserLookup,
  type BusinessGraphAccessContext,
  type BusinessGraphClock,
  type BusinessGraphQueryArgs,
  type BusinessGraphRequestContext,
  type BusinessGraphStoreProvider,
  type BusinessGraphTraversalStore,
  type CanonicalGraphAuditWriter,
  type RuntimeUserRecord,
  type TrustedAuthenticatedSession,
  type TrustedSessionSource,
} from "@/graph";
import { VALID_ORG } from "../fixtures/validFixture";

export { VALID_ORG };
export { nid, synthNode, synthEdge, synthSnapshot, healthyStore, storeWithHealth, StubStore, makeHealth } from "../traversal/helpers";
export { deriveAugmentedSnapshot, buildAugmentedRecords } from "../query/helpers";

// ---------------------------------------------------------------------------
// request / access contexts (opaque session ref + correlation id + safe args)
// ---------------------------------------------------------------------------

export function reqCtx(
  correlationId: string,
  args: BusinessGraphQueryArgs = {},
  sessionRef = "sess-1",
): BusinessGraphRequestContext {
  return { sessionIdentity: { sessionRef }, correlationId, args };
}

export function accessCtx(correlationId: string, sessionRef = "sess-1"): BusinessGraphAccessContext {
  return { sessionIdentity: { sessionRef }, correlationId };
}

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
// trusted session source (deterministic fake auth boundary)
// ---------------------------------------------------------------------------

export function trustedSession(
  over: Partial<TrustedAuthenticatedSession> = {},
): TrustedAuthenticatedSession {
  const sessionRef = over.sessionRef ?? "sess-1";
  return {
    authenticatedUserId: "u-tzachi",
    organizationId: VALID_ORG,
    roleId: "crole-ceo",
    actorKind: "HUMAN",
    sessionRef,
    issuedAtIso: FIXED_ISO,
    ...over,
  };
}

/** A source backed by an explicit map from sessionRef → trusted session. */
export function sessionSourceFrom(
  sessions: readonly TrustedAuthenticatedSession[],
): TrustedSessionSource {
  const byRef = new Map(sessions.map((s) => [s.sessionRef, s]));
  return { lookup: (ref) => byRef.get(ref) ?? null };
}

/** A source that resolves the given single session for any matching ref. */
export function singleSessionSource(session: TrustedAuthenticatedSession): TrustedSessionSource {
  return sessionSourceFrom([session]);
}

/** A source that never has an authenticated session (mirrors production). */
export const NO_SESSION_SOURCE: TrustedSessionSource = { lookup: () => null };

// ---------------------------------------------------------------------------
// active-user lookup (deterministic fake users repo)
// ---------------------------------------------------------------------------

export function activeUser(id: string): RuntimeUserRecord {
  return { id, status: "פעיל" };
}

export function userLookupFrom(users: readonly RuntimeUserRecord[]): ActiveUserLookup {
  const byId = new Map(users.map((u) => [u.id, u]));
  return { findUser: (id) => byId.get(id) ?? null };
}

/** The default lookup: u-tzachi is active. */
export function defaultUserLookup(): ActiveUserLookup {
  return userLookupFrom([activeUser("u-tzachi")]);
}

// ---------------------------------------------------------------------------
// recording store provider (counts getStore / dispose)
// ---------------------------------------------------------------------------

export interface RecordingStoreProvider {
  provider: BusinessGraphStoreProvider;
  getStoreCalls: () => number;
  disposeCalls: () => number;
}

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

/** A store surface that returns no snapshot + MISSING health. */
export function emptyStore(): BusinessGraphTraversalStore {
  return {
    getActiveSnapshot: () => Promise.resolve(null),
    getHealth: (organizationId: string) =>
      Promise.resolve({
        organizationId,
        state: "MISSING" as const,
        checkedAt: FIXED_ISO,
        activeSnapshotId: null,
        checksumVerified: false,
        findings: [],
      }),
  };
}

// ---------------------------------------------------------------------------
// a throwing canonical audit writer (to exercise fail-CLOSED)
// ---------------------------------------------------------------------------

export function throwingAuditWriter(): CanonicalGraphAuditWriter {
  return {
    write: () => {
      throw new Error("durable audit unavailable");
    },
  };
}

export function recordingAuditWriter(): {
  writer: CanonicalGraphAuditWriter;
  count: () => number;
} {
  let n = 0;
  return { writer: { write: () => void (n += 1) }, count: () => n };
}

// ---------------------------------------------------------------------------
// composition builder
// ---------------------------------------------------------------------------

export interface BuildCompositionOptions {
  sessionSource?: TrustedSessionSource;
  userLookup?: ActiveUserLookup;
  store?: BusinessGraphTraversalStore;
  storeProviderFactory?: () => BusinessGraphStoreProvider;
  auditAdapter?: RuntimeBusinessGraphAuditAdapter;
  exec?: () => string;
  featureEnabled?: boolean;
  rolloutApproved?: boolean;
}

/** Build a runtime composition from deterministic fakes; sensible defaults. */
export function buildComposition(opts: BuildCompositionOptions = {}): RuntimeBusinessGraphComposition {
  const store = opts.store ?? emptyStore();
  return new RuntimeBusinessGraphComposition({
    sessionSource: opts.sessionSource ?? singleSessionSource(trustedSession()),
    userLookup: opts.userLookup ?? defaultUserLookup(),
    storeProviderFactory: opts.storeProviderFactory ?? (() => createStoreProvider(store)),
    clock: CLOCK,
    ...(opts.auditAdapter ? { auditAdapter: opts.auditAdapter } : {}),
    executionIdProvider: opts.exec ?? counterExec(),
    featureOverride: opts.featureEnabled ?? true,
    rolloutOverride: opts.rolloutApproved ?? true,
  });
}
