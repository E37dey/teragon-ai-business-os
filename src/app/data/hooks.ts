// Repository ⇄ TanStack Query bridge — the single read/invalidate layer the
// shell (badges, search, notifications, quick-create) builds on. Screens in
// later waves reuse the same keys, so one mutation invalidates everything.
import { useCallback } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { BaseEntity } from "@/domain/types";
import { getRepository, type CollectionKey } from "@/repositories";
import { queryClient } from "@/app/queryClient";

export function collectionQueryKey(collection: CollectionKey): readonly [string, CollectionKey] {
  return ["collection", collection] as const;
}

/** Read a whole collection through the query cache. */
export function useCollection<T extends BaseEntity>(
  collection: CollectionKey,
): UseQueryResult<T[]> {
  return useQuery({
    queryKey: collectionQueryKey(collection),
    queryFn: () => getRepository<T>(collection).list(),
  });
}

/** Invalidate one or more collections (call after any repository write). */
export async function invalidateCollections(collections: readonly CollectionKey[]): Promise<void> {
  await Promise.all(
    collections.map((c) => queryClient.invalidateQueries({ queryKey: collectionQueryKey(c) })),
  );
}

/** Hook variant bound to the ambient QueryClient (for components). */
export function useInvalidateCollections(): (
  collections: readonly CollectionKey[],
) => Promise<void> {
  const qc = useQueryClient();
  // stable identity — safe to use in effect deps (W6-F defect #1)
  return useCallback(
    async (collections) => {
      await Promise.all(
        collections.map((c) => qc.invalidateQueries({ queryKey: collectionQueryKey(c) })),
      );
    },
    [qc],
  );
}
