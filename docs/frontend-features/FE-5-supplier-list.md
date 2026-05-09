# FE-5 — Supplier List

## Status
Not started   Owner: tbd   Effort: ~1.5 days

## Goal
Implement `/suppliers` — a paginated, searchable supplier list with an inline "toggle active" action. This is the first authed feature page; it proves the FE-0 list-query pattern (qk + endpoints + ApiError + envelope unwrap) end-to-end. Supplies the supplier-picker query that FE-11 (RFP submit) will reuse.

## Dependencies
- **FE-0** — `api`, `endpoints.supplier.*`, `qk.supplier.list`, `Table`/`Pagination`/`Input`/`Badge`/`Button`/`DropdownMenu`.
- **FE-4** — sidebar slot, route group `_authed`.

## Scope

### In scope
- Authed route `/_authed/suppliers/index.tsx`.
- shadcn `<DataTable>` (or composed `<Table>`) with columns: Code, Name, Email, Status badge, Active toggle, Actions menu (Edit / Delete — links to FE-6).
- Server-side pagination (`page`, `limit`); UI defaults `limit=10`, allows `25/50/100`.
- Server-side search via the documented `searchString` column. Client debounces input by 300ms.
- Sort by `createdAt desc` (default) and toggle `asc`.
- Inline "Toggle active" mutation hits `POST /api/supplier/:id/active-inactive`; optimistic flip with rollback on error.
- Empty state, error state, loading skeletons.
- Sidebar entry "Suppliers" pushed into `SIDEBAR_NAV` from FE-4.
- "New supplier" button links to `/suppliers/new` (FE-6).

### Out of scope (handled elsewhere)
- Create/edit/detail views → **FE-6**.
- Supplier groups / bulk import — not in any backend doc; defer.
- Deep filtering (status, hasResponded, etc.) — defer to a follow-up; v1 has search + pagination only.

## Implementation Plan
1. Add `features/supplier/types.ts` with `Supplier`, `SupplierListQuery`, `SupplierListResponse` types matching `docs/DB_SCHEMA.md` + `docs/CONVENTIONS.md` `countData`.
2. Add `features/supplier/api.ts` with `listSuppliers(query): Promise<SupplierListResponse>` and `toggleSupplierActive(id): Promise<Supplier>`.
3. Add `features/supplier/queries.ts` with `useSuppliersList(query)` and `useToggleSupplierActive(appId)` (mutation invalidates `qk.supplier.list(appId, ...)`).
4. Build `routes/_authed/suppliers/index.tsx` with table, search box, pagination controls. Sync state (page, limit, search) into URL search params via TanStack Router `validateSearch`.
5. Add MSW handlers covering the documented endpoint shapes.
6. Tests: see **Testing**.

## Files

### To create
- `apps/web/src/features/supplier/types.ts`
- `apps/web/src/features/supplier/api.ts`
- `apps/web/src/features/supplier/queries.ts`
- `apps/web/src/routes/_authed/suppliers/index.tsx`
- `apps/web/src/features/supplier/__tests__/list.test.tsx`

### To modify
- `apps/web/src/components/shell/Sidebar.tsx` — register the sidebar item.
- `apps/web/src/test/handlers.ts` — supplier list + toggle-active handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/supplier/types.ts
export interface Supplier {
  id: number;
  code: string;
  email: string;
  name: string;
  status: 'created' | 'deleted';
  active: boolean;
  isRegistered: boolean;
  creatorId: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListQuery {
  page: number;
  limit: number;
  search?: string;
  order?: 'asc' | 'desc';
}

export interface SupplierListResponse {
  items: Supplier[];
  countData: { pages: number; limit: number; totalCount: number; page: number };
}
```

```ts
// features/supplier/queries.ts
export function useSuppliersList(query: SupplierListQuery): UseQueryResult<SupplierListResponse>;
export function useToggleSupplierActive(appId: number): UseMutationResult<Supplier, ApiError, number>;
```

`useSuppliersList` is consumed by FE-11's supplier picker as well — keep the query key shape stable.

## Code Sketches

```ts
// features/supplier/queries.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { listSuppliers, toggleSupplierActive } from './api';
import { qk } from '@/lib/queryKeys';
import { env } from '@/config/env';

export function useSuppliersList(query: SupplierListQuery) {
  const appId = Number(env.VITE_DEFAULT_APP_ID);
  return useQuery({
    queryKey: qk.supplier.list(appId, query),
    queryFn: () => listSuppliers(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useToggleSupplierActive() {
  const appId = Number(env.VITE_DEFAULT_APP_ID);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleSupplierActive,
    onMutate: async (id) => {
      // optimistic flip across all list pages
    },
    onError: (_, __, ctx) => {/* rollback */},
    onSettled: () => qc.invalidateQueries({ queryKey: ['app', appId, 'supplier', 'list'] }),
  });
}
```

```tsx
// routes/_authed/suppliers/index.tsx
export const Route = createFileRoute('/_authed/suppliers/')({
  validateSearch: (s): SupplierListQuery => ({
    page: Number(s.page ?? 1),
    limit: Number(s.limit ?? 10),
    search: typeof s.search === 'string' ? s.search : undefined,
    order: s.order === 'asc' ? 'asc' : 'desc',
  }),
  component: SuppliersPage,
});
```

## Testing
- **Integration (RTL + MSW):**
  - Initial render → loading skeleton → table populated; pagination shows correct `pages`/`totalCount`.
  - Type into search box → debounce → URL search param updates → query refetches; old data shown with `placeholderData` until new data arrives.
  - Click "Toggle active" → optimistic flip; on mock 500 → rollback + error toast.
  - Page navigation: page 2 button updates URL; query key changes; table re-renders.

## Acceptance Criteria
- [ ] `/suppliers` renders the suppliers table; loading + empty + error states all distinct.
- [ ] Pagination controls reflect server `countData`.
- [ ] Search debounces and persists to the URL.
- [ ] Toggle active is optimistic and rolls back on failure with a toast.
- [ ] "New supplier" button links to `/suppliers/new`.
- [ ] Edit/delete actions in the row menu link to FE-6 routes (placeholders OK if FE-6 hasn't merged).
- [ ] Sidebar entry "Suppliers" present and active when on `/suppliers`.
- [ ] Query keys are namespaced under `appId` per FE-0's `qk` factory.

## Open Questions
- [ ] Does the listing endpoint actually accept `order`? Confirm against `docs/FLOWS/supplier-management-flow.md`. If not, drop it from the URL contract.
- [ ] How to render `isRegistered`? Backend tracks this; for v1 surface a small badge but don't make it filterable.
- [ ] Should soft-deleted (`status: 'deleted'`) suppliers ever appear? Per docs they don't — confirm the endpoint already filters them out.

## Cross-references
- [`/docs/FLOWS/supplier-management-flow.md`](../FLOWS/supplier-management-flow.md).
- [`/docs/CONVENTIONS.md`](../CONVENTIONS.md) §Listing pagination.
- Upstream: [FE-0](./FE-0-foundation.md), [FE-4](./FE-4-app-shell.md).
- Downstream: [FE-6](./FE-6-supplier-crud.md) (CRUD), [FE-11](./FE-11-rfp-submit.md) (supplier picker reuses `useSuppliersList`).
