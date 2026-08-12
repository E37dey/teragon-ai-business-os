// TERAGON AI BUSINESS OS — Gate S9.1: the composition React binding.
//
// Builds the CompositionState from the S8 Auth context + the resolved provider,
// and exposes `useDomainRepository(collection)` — the ONE hook domain UI uses to
// obtain a repository. No component may inspect env vars and pick its own repo.
import { createContext, useContext, useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { AuthContext } from "@/auth/authContext";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import { getRepository } from "@/repositories/factory";
import type { Repository } from "@/repositories/Repository";
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import {
  classifyDomainAccess,
  DomainCompositionError,
  type CompositionState,
} from "./domainComposition";

const CompositionContext = createContext<CompositionState | null>(null);

export function DomainRepositoryProvider({
  children,
  providerOverride,
}: {
  children: ReactNode;
  /** tests/harness only. Default = the resolved build provider. */
  providerOverride?: PersistenceProvider;
}): ReactElement {
  const auth = useContext(AuthContext); // null-safe: absent provider ⇒ LOCAL-like
  const state = useMemo<CompositionState>(
    () => ({
      provider: providerOverride ?? PERSISTENCE_PROVIDER,
      sessionActive: auth?.status === "AUTHENTICATED",
      identity: auth?.identity ?? null,
    }),
    [providerOverride, auth?.status, auth?.identity],
  );
  return <CompositionContext.Provider value={state}>{children}</CompositionContext.Provider>;
}

/** The current composition state (provider / session / canonical identity). */
export function useDomainComposition(): CompositionState {
  const ctx = useContext(CompositionContext);
  if (ctx) return ctx;
  // No provider mounted (e.g. isolated component tests) → behave as LOCAL.
  return { provider: PERSISTENCE_PROVIDER, sessionActive: false, identity: null };
}

export type DomainRepoResult<T extends BaseEntity> =
  | { status: "local"; repo: Repository<T> }
  | { status: "not-connected" }
  | { status: "error"; error: DomainCompositionError };

/**
 * Resolve a repository for `collection` through the composition. In LOCAL mode
 * returns the local repository (unchanged behavior). In SUPABASE mode: every
 * domain is NOT_CONNECTED this checkpoint (no IndexedDB, no fallback); a missing
 * session / identity surfaces as a typed error.
 */
export function useDomainRepository<T extends BaseEntity = BaseEntity>(
  collection: CollectionKey,
): DomainRepoResult<T> {
  const state = useDomainComposition();
  return useMemo<DomainRepoResult<T>>(() => {
    let access;
    try {
      access = classifyDomainAccess(collection, state);
    } catch (err) {
      return { status: "error", error: err as DomainCompositionError };
    }
    if (access.mode === "LOCAL") return { status: "local", repo: getRepository<T>(collection) };
    // SUPABASE_CONNECTED is unreachable in Checkpoint A (no connected domains);
    // both it and NOT_CONNECTED resolve to not-connected here.
    return { status: "not-connected" };
  }, [collection, state]);
}
