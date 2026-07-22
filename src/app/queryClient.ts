// TanStack Query client — the single cache/invalidation layer above repositories.
// Mutations invalidate dependent queries so one change ("ליד חדש") updates
// list/search/KPI/funnel/feed at once (Wave 2+ hooks build on this instance).
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // local-first data: reads are cheap, so keep them fresh but avoid refetch storms
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
