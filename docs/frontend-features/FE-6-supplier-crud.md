# FE-6 — Supplier CRUD (Create, Edit, Detail, Soft-Delete)

## Status
Not started   Owner: tbd   Effort: ~1.5 days

## Goal
Round out supplier management with create / edit / detail / soft-delete on top of the FE-5 list. Forms mirror the backend's email + name validation. Mutations invalidate FE-5's list cache so changes are visible immediately. Ownership semantics (creator-only edit) are enforced server-side; client surfaces the resulting 403 with a clear toast.

## Dependencies
- **FE-5** — `useSuppliersList`, query keys, types.

## Scope

### In scope
- Authed routes:
  - `/_authed/suppliers/new` — RHF + Zod form (name, email).
  - `/_authed/suppliers/:id` — read-only detail view (calls `GET /api/supplier/:id`).
  - `/_authed/suppliers/:id/edit` — RHF + Zod form prefilled from detail.
- Soft-delete confirmation `<Dialog>` from any row's actions menu (added in FE-5).
- Optimistic updates for edit; pessimistic for create (we need the server-assigned id).
- Mutations invalidate the FE-5 list query and the detail query.
- 403 surfacing: "You can't edit this supplier — it belongs to another user."
- Email uniqueness conflict (409) → inline field error.

### Out of scope (handled elsewhere)
- Toggle active → already in FE-5.
- Bulk operations — defer.
- Supplier-of-supplier hierarchies — out of scope for v1.

## Implementation Plan
1. Add Zod `supplierFormSchema` to `features/supplier/schemas.ts`.
2. Extend `features/supplier/api.ts` with `getSupplier`, `createSupplier`, `updateSupplier`, `deleteSupplier`.
3. Extend `features/supplier/queries.ts` with `useSupplier(id)`, `useCreateSupplier`, `useUpdateSupplier`, `useDeleteSupplier`.
4. Build the three routes; `<SupplierForm>` is shared between create and edit.
5. Hook the row-level Edit/Delete actions in FE-5's table to these routes / mutation.
6. Tests (see below).

## Files

### To create
- `apps/web/src/features/supplier/schemas.ts`
- `apps/web/src/components/supplier/SupplierForm.tsx`
- `apps/web/src/routes/_authed/suppliers/new.tsx`
- `apps/web/src/routes/_authed/suppliers/$id/index.tsx`
- `apps/web/src/routes/_authed/suppliers/$id/edit.tsx`
- `apps/web/src/features/supplier/__tests__/crud.test.tsx`

### To modify
- `apps/web/src/features/supplier/api.ts` — add CRUD calls.
- `apps/web/src/features/supplier/queries.ts` — add hooks.
- `apps/web/src/test/handlers.ts` — add supplier CRUD MSW handlers.
- `apps/web/src/lib/queryKeys.ts` — confirm `qk.supplier.detail(appId, id)` exists (FE-0 already includes it).

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/supplier/schemas.ts
export const supplierFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
});
export type SupplierFormInput = z.infer<typeof supplierFormSchema>;
```

```ts
// features/supplier/queries.ts (added)
export function useSupplier(id: number): UseQueryResult<Supplier>;
export function useCreateSupplier(): UseMutationResult<Supplier, ApiError, SupplierFormInput>;
export function useUpdateSupplier(id: number): UseMutationResult<Supplier, ApiError, SupplierFormInput>;
export function useDeleteSupplier(): UseMutationResult<void, ApiError, number>;
```

## Code Sketches

```tsx
// components/supplier/SupplierForm.tsx
type Props = {
  defaultValues?: Partial<SupplierFormInput>;
  onSubmit: (v: SupplierFormInput) => void;
  submitting?: boolean;
};
export function SupplierForm({ defaultValues, onSubmit, submitting }: Props) {
  const form = useForm<SupplierFormInput>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues,
  });
  // ... shadcn Form composition
}
```

```ts
// useDeleteSupplier (sketch)
export function useDeleteSupplier() {
  const appId = Number(env.VITE_DEFAULT_APP_ID);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app', appId, 'supplier'] });
      toast.success('Supplier deleted');
    },
    onError: (e) => toast.error(e.status === 403 ? 'Not your supplier' : e.message),
  });
}
```

## Testing
- **Integration:**
  - Create: submit valid form → 201 → toast → navigate to `/suppliers/:id`; list query invalidates.
  - Create with duplicate email: 409 → inline `email` error.
  - Edit: prefilled form → change name → submit → optimistic update visible in list immediately.
  - Edit by non-owner: 403 → toast "Not your supplier"; navigation aborted.
  - Delete from row menu: confirmation dialog → confirm → list refreshes; deleted row disappears.
- **Unit:** schema rejects empty name / invalid email.

## Acceptance Criteria
- [ ] `/suppliers/new` creates a supplier; on success navigates to detail.
- [ ] `/suppliers/:id` renders detail with code, email, name, status, active, registered flags.
- [ ] `/suppliers/:id/edit` prefills and updates; success invalidates list + detail caches.
- [ ] Soft-delete via dialog removes from list; backend status flips to `deleted`.
- [ ] 403 / 409 / network errors all flow through `ApiError` with appropriate toasts / inline messages.
- [ ] No detail/edit page is accessible for soft-deleted suppliers.

## Open Questions
- [ ] Backend `code` is auto-generated (currently a stub per CLAUDE.md). The form does not accept `code`. Confirm the create endpoint returns the generated code for the post-create navigation.
- [ ] On edit, does the backend allow changing the email? If yes, mention to the user that supplier-portal links won't change retroactively (no replyToken affected). For v1, **allow but warn**.

## Cross-references
- [`/docs/FLOWS/supplier-management-flow.md`](../FLOWS/supplier-management-flow.md).
- Upstream: [FE-5](./FE-5-supplier-list.md).
- Downstream: [FE-11](./FE-11-rfp-submit.md) — supplier picker reuses the same data shape.
