# FE-11 — RFP Submit + Supplier Invitation Picker

## Status
Not started   Owner: tbd   Effort: ~1.5 days

## Goal
Hand the RFP submit flow a supplier picker. After SUBMIT-mode validation passes, open a dialog letting the user multi-select previously-created suppliers; on confirm, post the RFP with `method: 'submit', action: 'create' | 'edit', supplierIds`. Email-sending itself is backend territory (F2/F3); FE-11 only triggers the submit and surfaces a "Invitations queued" toast.

## Dependencies
- **FE-5** — `useSuppliersList` (paged + searchable supplier query).
- **FE-6** — supplier types.
- **FE-10** — `useSaveRfp`, `RfpSavePayload`.

## Scope

### In scope
- `<RfpSubmitDialog>` component: opens from FE-10's Submit button when SUBMIT-mode validation has passed.
- Multi-select supplier picker inside the dialog: search box (debounced, hits FE-5's query), virtualised list for >100 results, checkboxes, "Select all on this page" helper, selected-count footer.
- "Invite" button → calls `useSaveRfp({ ... method: 'submit', supplierIds })`; on success, toast: "RFP submitted — invitations queued for N suppliers" (when backend F2/F3 are merged the toast becomes "N invitations sent"; FE-12 owns the live status).
- "Cancel" button restores the form's SUBMIT-pending state.
- Edge case: zero suppliers selected — block submit with a banner inside the dialog.
- Edge case: a supplier the user previously invited (visible from the loaded RFP for an edit-after-draft scenario) is preselected and shown as "already invited" — disabled checkbox with a chip.

### Out of scope (handled elsewhere)
- Email delivery status / per-supplier polling → **FE-12** (deferred-stub; lights up with backend F2/F3/F6).
- Email template preview — defer to a follow-up after FE-12 merges.
- Inviting suppliers that don't exist yet (inline create) — defer.

## Implementation Plan
1. Build `<RfpSubmitDialog>` with `<Dialog>`, `<Input>` (search), `<Command>` or virtualised list, `<Checkbox>`, footer.
2. Add `<SupplierPickerList>` consuming `useSuppliersList({ page, limit: 50, search })` with infinite-scroll OR paged controls.
3. Wire from FE-10's Submit button: `setSubmitDialogOpen(true)` when SUBMIT-mode RHF validation succeeds; close on cancel/submit.
4. Add `supplierIds: number[]` to the FE-10 `RfpSavePayload` and ensure FE-10's mutation forwards it.
5. After success, invalidate `qk.rfp.list` and `qk.rfp.detail(id)` and navigate to `/rfps/:id`.
6. MSW handlers for the submit endpoint (already in FE-10) — extend fixture so the response carries the `RFPSupplier[]` invitations.
7. Tests.

## Files

### To create
- `apps/web/src/features/rfp/RfpSubmitDialog.tsx`
- `apps/web/src/features/rfp/SupplierPickerList.tsx`
- `apps/web/src/features/rfp/__tests__/submit.test.tsx`

### To modify
- `apps/web/src/routes/_authed/rfps/new.tsx` — open the dialog on Submit instead of falling back to direct post.
- `apps/web/src/routes/_authed/rfps/$id/edit.tsx` — same.
- `apps/web/src/features/rfp/types.ts` — confirm `supplierIds` is on `RfpSavePayload`.

## Config / Env Vars
None new.

## Packages
None new (`<Command>` from shadcn already installed in FE-0 if it was checked in).

## Contracts Exported

```ts
// features/rfp/RfpSubmitDialog.tsx
export interface RfpSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Caller is responsible for invoking this with the picked supplierIds:
  onConfirm: (supplierIds: number[]) => void;
  preselectedSupplierIds?: number[];     // already-invited suppliers (locked)
  submitting?: boolean;
}
export function RfpSubmitDialog(props: RfpSubmitDialogProps): JSX.Element;
```

## Code Sketches

```tsx
// features/rfp/SupplierPickerList.tsx (sketch)
export function SupplierPickerList({ value, onChange, lockedIds }: {
  value: Set<number>;
  onChange: (next: Set<number>) => void;
  lockedIds: Set<number>;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const { data } = useSuppliersList({ page: 1, limit: 50, search: debounced });
  return (
    <div>
      <Input placeholder="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="max-h-72 overflow-auto">
        {data?.items.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1">
            <Checkbox
              checked={value.has(s.id)}
              disabled={lockedIds.has(s.id)}
              onCheckedChange={(checked) => {
                const next = new Set(value);
                checked ? next.add(s.id) : next.delete(s.id);
                onChange(next);
              }}
            />
            <span>{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.email}</span>
            {lockedIds.has(s.id) && <Badge variant="secondary">already invited</Badge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Testing
- **Integration:**
  - SUBMIT click with invalid form → dialog never opens; RHF errors visible.
  - SUBMIT click with valid form → dialog opens; pick 2 suppliers → confirm → mock 200 → navigate to `/rfps/:id` with toast.
  - Zero suppliers selected → confirm button disabled; banner visible.
  - Already-invited suppliers preselected and locked.
  - Search filters the list (debounced); selection persists across searches.

## Acceptance Criteria
- [ ] Submit opens the picker only after RHF SUBMIT validation passes.
- [ ] At least 1 supplier required to confirm.
- [ ] Preselected/locked suppliers cannot be unchecked.
- [ ] Successful submit invalidates RFP list + detail caches and navigates to detail.
- [ ] Toast clearly distinguishes "queued" vs "sent" (today: "queued" — wording flips when backend F2/F3 merge).
- [ ] Dialog cancel returns the page to its prior state with no submission.
- [ ] No supplier email is dispatched from the client; this is purely a backend trigger.

## Open Questions
- [ ] Submission payload — is `supplierIds: number[]` enough, or does the backend want a richer object (e.g., per-supplier message)? Per `docs/FLOWS/rfp-creation-flow.md`, the documented payload doesn't include suppliers explicitly; flag with backend owner. **Recommend** `supplierIds: number[]` and let backend evolve to a richer shape behind a wrapper later.
- [ ] What happens on partial failures (some invitations queued, some not)? F2/F3 territory; until they ship, treat the response as binary success/failure.
- [ ] Should the picker support "invite all" up to a cap? **Defer** — premature.

## Cross-references
- [`/docs/FLOWS/rfp-creation-flow.md`](../FLOWS/rfp-creation-flow.md).
- [`/docs/email-features/F2-outbound-email-system.md`](../email-features/F2-outbound-email-system.md), [`/docs/email-features/F3-rfp-email-integration.md`](../email-features/F3-rfp-email-integration.md) — backend-side dependencies for the live "sent" state.
- Upstream: [FE-5](./FE-5-supplier-list.md), [FE-6](./FE-6-supplier-crud.md), [FE-10](./FE-10-rfp-create-edit.md).
- Downstream: [FE-12](./FE-12-rfp-detail-status.md).
