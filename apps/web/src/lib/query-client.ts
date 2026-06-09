import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't refetch on window focus during dev
        refetchOnWindowFocus: false,
        // Stale-while-revalidate: data is fresh for 30 sec
        staleTime: 30 * 1000,
        // Retry failed queries once
        retry: 1,
      },
    },
  });
}
