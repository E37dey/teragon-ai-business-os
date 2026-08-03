// TERAGON AI BUSINESS OS — Gate S9.2-A1b: composition-aware collection read hook.
//
// The ONE read seam a domain screen uses instead of the raw local `useCollection`.
// It branches on the resolved persistence provider:
//   * LOCAL_INDEXEDDB → byte-for-byte the existing `useCollection` behavior (same
//     query key + queryFn) so the shell (badges, search, quick-create) and its
//     invalidation keep working unchanged.
//   * SUPABASE → an authenticated, identity-aware remote read through the
//     `loadSupabaseDomainRepository` seam. It waits for Auth to initialize, runs
//     ONLY with an active session + canonical identity, NEVER calls the legacy
//     `getRepository`, and NEVER silently falls back to local: a non-ok
//     `RepoResult` is thrown as a typed, user-safe error.
//
// SECURITY: the query key is scoped to provider + collection + authenticated user
// + canonical organization — so one user's cached rows can never serve another,
// and org is taken ONLY from the canonical identity (never a token/session, never
// a browser-supplied value). On loss of authentication (logout / expiry) any
// cached protected remote records are cancelled + removed.
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { BaseEntity } from "@/domain/types";
import { getRepository, type CollectionKey } from "@/repositories";
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import { useAuth } from "@/auth/useAuth";
import { loadSupabaseDomainRepository } from "@/persistence/composition/loadSupabaseDomainRepository";
import type { SafeError } from "@/persistence/result";
import { collectionQueryKey } from "./hooks";
import { newCorrelationId, reportDomainFailure } from "@/observability/domainEvents";

/** Root prefix for every SUPABASE domain-collection query (used for bulk purge). */
const SUPABASE_DOMAIN_KEY_ROOT = ["domain-collection", "SUPABASE"] as const;

/**
 * A typed, user-safe read error. Carries the boundary's SAFE error (a stable code
 * + Hebrew message) — never a raw driver payload, token, or session.
 */
export class DomainReadError extends Error {
  readonly safe: SafeError;
  constructor(safe: SafeError) {
    super(safe.message);
    this.name = "DomainReadError";
    this.safe = safe;
  }
}

/** Extract the user-safe message from a thrown query error (best-effort, no leak). */
export function domainReadMessage(error: unknown): string | null {
  if (error instanceof DomainReadError) return error.safe.message;
  return null;
}

/**
 * Read a whole collection through the composition boundary.
 *
 * Pagination + text filtering are applied CLIENT-SIDE by the screen this
 * checkpoint (customer volume is bounded); they are deliberately NOT cache-key
 * dimensions — keying by the search box would refetch on every keystroke. Only
 * the security-relevant identity dims (provider, collection, user, org) key the
 * cache. Server-side range pagination is a later (A1c+) extension of the queryFn.
 */
export function useDomainCollection<T extends BaseEntity>(
  collection: CollectionKey,
  provider: PersistenceProvider = PERSISTENCE_PROVIDER,
): UseQueryResult<T[]> {
  const { status, identity } = useAuth();
  const qc = useQueryClient();

  const isSupabase = provider === "SUPABASE";
  const authed = status === "AUTHENTICATED" && identity !== null;
  const userId = identity?.userId ?? null;
  const orgId = identity?.organizationId ?? null;

  // Defense-in-depth: when the SUPABASE session is lost (logout / expiry / an
  // unresolved identity) cancel any in-flight remote read and DROP the cached
  // protected records so a subsequent viewer never sees the prior user's data.
  // Safe to purge by prefix here precisely because no query is active while
  // unauthenticated (the SUPABASE branch is `enabled: authed`).
  useEffect(() => {
    if (isSupabase && !authed) {
      void qc.cancelQueries({ queryKey: SUPABASE_DOMAIN_KEY_ROOT });
      qc.removeQueries({ queryKey: SUPABASE_DOMAIN_KEY_ROOT });
    }
  }, [isSupabase, authed, qc]);

  return useQuery<T[]>(
    isSupabase
      ? {
          // provider · collection · authenticated user · canonical org — never a
          // token/session, never a browser-supplied org.
          queryKey: [...SUPABASE_DOMAIN_KEY_ROOT, collection, userId, orgId] as const,
          enabled: authed, // wait for Auth init; run only with a canonical identity
          retry: false, // no retry-through-fallback; a failure stays a typed error
          queryFn: async (): Promise<T[]> => {
            // S10.0-C: ONE correlation id per ACTUAL read. queryFn runs per
            // operation, not per render, so a rerender cannot duplicate an
            // event and retry:false keeps it to a single execution.
            const correlationId = newCorrelationId();
            try {
              const repo = await loadSupabaseDomainRepository<T>(collection, {
                provider: "SUPABASE",
                sessionActive: status === "AUTHENTICATED",
                identity,
              });
              const res = await repo.listSafe();
              if (!res.ok) throw new DomainReadError(res.error);
              return res.data;
            } catch (e) {
              // Observe, then rethrow UNCHANGED — retries, caching, typed errors
              // and UI messages must behave exactly as before.
              reportDomainFailure("read", collection, e, correlationId);
              throw e;
            }
          },
        }
      : {
          // LOCAL: identical to useCollection — shared key + queryFn so existing
          // invalidation (invalidateCollections) still refreshes this read.
          queryKey: collectionQueryKey(collection),
          queryFn: () => getRepository<T>(collection).list(),
        },
  );
}
