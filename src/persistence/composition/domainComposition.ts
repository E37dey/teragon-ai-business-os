// TERAGON AI BUSINESS OS — Gate S9.1: central domain repository composition.
//
// The ONE boundary every domain repository access resolves through. It receives
// the selected persistence provider + the authenticated session state + the
// canonical resolved identity, and decides how a collection is served:
//   * LOCAL_INDEXEDDB           → the existing local behavior (unchanged).
//   * SUPABASE + connected      → an authenticated Supabase repo (Checkpoint B —
//                                 NO domain is connected yet in Checkpoint A).
//   * SUPABASE + not connected  → DOMAIN_NOT_CONNECTED (never IndexedDB, never a
//                                 stale local read, never a silent fallback).
// Fail-closed in SUPABASE mode: no session → AUTH_REQUIRED; unresolved canonical
// identity → IDENTITY_INVALID. Org/role/active come ONLY from the canonical
// identity, never from a component, form, URL, or localStorage.
import type { ResolvedIdentity } from "@/auth/types";
import type { CollectionKey } from "@/repositories/collections";
import type { PersistenceProvider } from "@/persistence/provider";

export type DomainErrorCode =
  | "AUTH_REQUIRED"
  | "IDENTITY_INVALID"
  | "DOMAIN_NOT_CONNECTED"
  | "REMOTE_OPERATION_FAILED"
  | "REMOTE_REPOSITORY_LOAD_FAILED"
  | "PROVIDER_BYPASS_FORBIDDEN";

export class DomainCompositionError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainCompositionError";
    this.code = code;
  }
}

/**
 * Collections the authenticated Supabase seam is IMPLEMENTATION-READY to serve.
 * S9.2-A1d2a-1B2: `customers` is route-mounted (list + detail) and now
 * **LIVE_VALIDATED** — the 12-test live customer acceptance passed 12/12 against
 * live `teragon-staging` on the GitHub-hosted runner, with verified fixture
 * cleanup and a zero-orphan audit.
 * S9.3-E: `contacts` is now **LIVE_VALIDATED** too — list read, customer-scoped
 * read, create and update passed 12/12 against live `teragon-staging` on the
 * GitHub-hosted runner, with verified cleanup and a zero-orphan audit. Contacts
 * still has NO delete and NO detail route. Every other domain is NOT_CONNECTED
 * and MUST stay that way until separately validated.
 */
export const SUPABASE_CONNECTED_DOMAINS: readonly CollectionKey[] = ["customers", "contacts"];

export function isSupabaseConnectedDomain(collection: CollectionKey): boolean {
  return SUPABASE_CONNECTED_DOMAINS.includes(collection);
}

/** The inputs the composition decides from — all from trusted sources only. */
export interface CompositionState {
  readonly provider: PersistenceProvider;
  /** true only when the auth boundary reports an AUTHENTICATED session. */
  readonly sessionActive: boolean;
  /** the canonical, server-resolved identity (never browser-supplied). */
  readonly identity: ResolvedIdentity | null;
}

export type DomainAccess =
  | { readonly mode: "LOCAL" }
  | { readonly mode: "SUPABASE_CONNECTED"; readonly organizationId: string }
  | { readonly mode: "NOT_CONNECTED" };

/**
 * Decide how a collection is served. Throws (fail-closed) in SUPABASE mode when
 * there is no session or the canonical identity is not resolved. Pure + total.
 */
export function classifyDomainAccess(
  collection: CollectionKey,
  state: CompositionState,
): DomainAccess {
  if (state.provider !== "SUPABASE") return { mode: "LOCAL" };
  if (!state.sessionActive) {
    throw new DomainCompositionError("AUTH_REQUIRED", "authenticated session required");
  }
  const id = state.identity;
  if (!id || !id.organizationId || !id.roleId) {
    throw new DomainCompositionError("IDENTITY_INVALID", "canonical identity is not resolved");
  }
  if (isSupabaseConnectedDomain(collection)) {
    return { mode: "SUPABASE_CONNECTED", organizationId: id.organizationId };
  }
  return { mode: "NOT_CONNECTED" };
}

/** True when the collection is served (LOCAL or a connected Supabase repo). */
export function isCollectionServable(collection: CollectionKey, state: CompositionState): boolean {
  try {
    return classifyDomainAccess(collection, state).mode !== "NOT_CONNECTED";
  } catch {
    return false;
  }
}
