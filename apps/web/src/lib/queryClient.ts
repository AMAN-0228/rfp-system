/**
 * Singleton TanStack Query client.
 *
 * Defaults chosen for v1:
 *  - `staleTime: 30s` — list/detail screens don't re-fetch on every mount.
 *  - `retry: 1` — one retry on transient failures; prevents long retry storms.
 *  - `refetchOnWindowFocus: false` — too noisy in a B2B app where users
 *    Alt-Tab constantly between RFP, email, and supplier portals.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
