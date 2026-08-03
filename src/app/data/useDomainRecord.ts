// TERAGON AI BUSINESS OS — Gate S9.2-A1d1: composition-aware single-record read.
//
// The read seam for a single entity by id (customer DETAIL). Mirrors
// useDomainCollection's security model:
//   * LOCAL_INDEXEDDB → the local factory get by id.
//   * SUPABASE → an authenticated, identity-aware remote read via
//     loadSupabaseDomainRepository(...).getSafe(id). Waits for Auth, runs ONLY
//     with an active session + canonical identity, NEVER calls getRepository,
//     NEVER falls back locally; a non-ok RepoResult is thrown as a typed,
//     user-safe DomainReadError. A successful read with `undefined` data means
//     NOT FOUND (a real remote miss), not an error.
//
// The query key is scoped to provider + collection + id + authenticated user +
// canonical organization (no tokens/sessions), so one user's cached record can
// never serve another. On loss of auth, in-flight reads are cancelled and cached
// protected records are removed.
import { useEffect } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { BaseEntity } from "@/domain/types";
import { getRepository, type CollectionKey } from "@/repositories";
import { PERSISTENCE_PROVIDER, type PersistenceProvider } from "@/persistence/provider";
import { useAuth } from "@/auth/useAuth";
import { loadSupabaseDomainRepository } from "@/persistence/composition/loadSupabaseDomainRepository";
import { DomainReadError } from "./useDomainCollection";
import { newCorrelationId, reportDomainFailure } from "@/observability/domainEvents";

const SUPABASE_RECORD_KEY_ROOT = ["domain-record", "SUPABASE"] as const;

/**
 * Read one record of `collection` by `id` through the composition boundary. When
 * `id` is missing the query stays disabled (the caller renders an invalid-id
 * state). A SUPABASE success with `undefined` data is a genuine NOT FOUND.
 */
export function useDomainRecord<T extends BaseEntity>(
  collection: CollectionKey,
  id: string | undefined,
  provider: PersistenceProvider = PERSISTENCE_PROVIDER,
  // NOTE: not-found is `null`, never `undefined` — TanStack Query forbids a
  // queryFn returning `undefined` (it would surface as an error, not a miss).
): UseQueryResult<T | null> {
  const { status, identity } = useAuth();
  const qc = useQueryClient();

  const isSupabase = provider === "SUPABASE";
  const authed = status === "AUTHENTICATED" && identity !== null;
  const hasId = typeof id === "string" && id.length > 0;
  const userId = identity?.userId ?? null;
  const orgId = identity?.organizationId ?? null;

  // On loss of auth (logout / expiry / unresolved identity) cancel in-flight
  // reads and drop cached protected records — safe by prefix because the
  // SUPABASE branch is disabled while unauthenticated.
  useEffect(() => {
    if (isSupabase && !authed) {
      void qc.cancelQueries({ queryKey: SUPABASE_RECORD_KEY_ROOT });
      qc.removeQueries({ queryKey: SUPABASE_RECORD_KEY_ROOT });
    }
  }, [isSupabase, authed, qc]);

  return useQuery<T | null>(
    isSupabase
      ? {
          queryKey: [...SUPABASE_RECORD_KEY_ROOT, collection, id ?? null, userId, orgId] as const,
          enabled: authed && hasId,
          retry: false,
          queryFn: async (): Promise<T | null> => {
            // S10.0-C: ONE correlation id per ACTUAL read (queryFn runs per
            // operation, not per render).
            const correlationId = newCorrelationId();
            try {
              const repo = await loadSupabaseDomainRepository<T>(collection, {
                provider: "SUPABASE",
                sessionActive: status === "AUTHENTICATED",
                identity,
              });
              const res = await repo.getSafe(id as string);
              if (!res.ok) throw new DomainReadError(res.error);
              return res.data ?? null; // null ⇒ not found
            } catch (e) {
              // Observe, then rethrow UNCHANGED.
              reportDomainFailure("read", collection, e, correlationId);
              throw e;
            }
          },
        }
      : {
          queryKey: ["domain-record", "LOCAL", collection, id ?? null] as const,
          enabled: hasId,
          queryFn: async (): Promise<T | null> => (await getRepository<T>(collection).get(id as string)) ?? null,
        },
  );
}
