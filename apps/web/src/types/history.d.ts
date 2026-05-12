/**
 * Module augmentation for TanStack's history `HistoryState`.
 *
 * Any route that stashes typed blobs into `navigate({ state })` adds its key
 * here so the `state` option is type-safe at call sites without `as never`
 * casts. The runtime shape is still re-validated at read time (with zod)
 * because direct visits, back/forward, or stale tabs can land on a route
 * with anything in `history.state`.
 */
import type { RegisterCarryOver } from '@/features/auth/schemas';

declare module '@tanstack/history' {
  interface HistoryState {
    authReg?: RegisterCarryOver;
  }
}

export {};
