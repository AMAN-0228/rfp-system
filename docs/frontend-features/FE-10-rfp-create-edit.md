# FE-10 — RFP Create/Draft + Edit

## Status
Not started   Owner: tbd   Effort: ~2 days

## Goal
Wire the FE-8 form engine into the RFP-authoring flow: `/rfps/new` (create + save-as-draft) and `/rfps/:id/edit` (load existing → mutate → save or hand off to FE-11 for submission). Owns the RFP-side payload assembly (`appId`, `templateId`, `method`, `action`); leaves the supplier-invitation step to FE-11. If FE-11 has not merged yet, the SUBMIT button can post directly with no supplier picker.

## Dependencies
- **FE-7** — `useTemplate(id)`.
- **FE-8** — `<TemplateForm>`, `serialiseTemplateForm`, `FormState` types.
- **FE-9** — RFP list query (for invalidation on success).
- **FE-0** — `api`, `endpoints.rfp.{create, detail}`, `qk.rfp.*`.

## Scope

### In scope
- Authed route `/_authed/rfps/new` — accepts `?templateId=` (from FE-7's "Use this template" CTA). If missing, render a template picker first.
- Authed route `/_authed/rfps/$id/edit` — load existing RFP, hydrate `<TemplateForm>` defaults, allow save-as-draft and submit.
- "Save Draft" button → `serialiseTemplateForm(... method: 'save', action: 'create' | 'edit' ...)` → POST.
- "Submit" button → if FE-11 is merged, opens its supplier picker dialog; otherwise (feature-flagged) posts directly with `method: 'submit'` and no suppliers.
- Subject field above the form (the RFP `subject` is a top-level RFP field, not a template field). Required for SUBMIT, optional for SAVE.
- Cancel button: navigates back; if dirty, confirm dialog.
- After successful save, navigate to `/rfps/:id/edit` (so the same page shows the saved entity).
- After successful submit (when not handing to FE-11), navigate to `/rfps/:id` (FE-12 stub).
- Loading skeletons for template + RFP fetch.
- Sidebar "New RFP" CTA already lives in FE-9.

### Out of scope (handled elsewhere)
- The form rendering itself → **FE-8**.
- Supplier picker → **FE-11**.
- RFP detail / status → **FE-12**.

## Implementation Plan
1. Extend `features/rfp/api.ts` with `getRfp(id)`, `createOrUpdateRfp(payload)` (the same POST endpoint handles both per docs).
2. Extend `features/rfp/queries.ts` with `useRfp(id)` and `useSaveRfp()` (mutation).
3. Build `routes/_authed/rfps/new.tsx`: read `?templateId=`; render `<TemplateForm>` with mode `save` initially; on Submit click, switch the validation to `submit` and re-validate.
4. Build `routes/_authed/rfps/$id/edit.tsx`: fetch RFP detail + its template, hydrate `defaultValues` from the RFP's `template.schema`, render `<TemplateForm>` with `topLevelAction='edit'`.
5. Add a `<RfpSubjectField>` above the form (required for SUBMIT, optional for SAVE).
6. Wire feature-flag fallback: if `import('@/features/rfp/submit-dialog').then(...)` fails / not exported (i.e., FE-11 hasn't merged), Submit posts directly.
7. Tests.

## Files

### To create
- `apps/web/src/routes/_authed/rfps/new.tsx`
- `apps/web/src/routes/_authed/rfps/$id/edit.tsx`
- `apps/web/src/features/rfp/RfpSubjectField.tsx`
- `apps/web/src/features/rfp/__tests__/create-edit.test.tsx`

### To modify
- `apps/web/src/features/rfp/api.ts` — add `getRfp`, `createOrUpdateRfp`.
- `apps/web/src/features/rfp/queries.ts` — add `useRfp`, `useSaveRfp`.
- `apps/web/src/features/rfp/types.ts` — add full `Rfp` type (extends `RfpSummary` with `template` snapshot, line items, etc.).
- `apps/web/src/test/handlers.ts` — add RFP detail + create/update handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/rfp/types.ts (added)
export interface Rfp extends RfpSummary {
  fieldResponses: Record<string, unknown>;     // backend RFP top-level form responses
  templateSnapshot: Template;                   // frozen template at submission time
  schema: FormState;                            // the FE-8 FormState that round-trips
  lineItems: LineItem[];                        // for FE-12 detail
  suppliers: RfpSupplierLink[];                 // for FE-12 detail
}

export interface RfpSavePayload {
  method: 'save' | 'submit';
  action: 'create' | 'edit';
  appId: number;
  rfpId?: number;       // for edit
  subject: string;
  template: { id: number; schema: FormState };
  // Suppliers added by FE-11; absent for save-as-draft.
  supplierIds?: number[];
}
```

```ts
// queries.ts
export function useRfp(id: number): UseQueryResult<Rfp>;
export function useSaveRfp(): UseMutationResult<Rfp, ApiError, RfpSavePayload>;
```

## Code Sketches

```tsx
// routes/_authed/rfps/new.tsx
export const Route = createFileRoute('/_authed/rfps/new')({
  validateSearch: (s): { templateId?: number } => ({
    templateId: s.templateId ? Number(s.templateId) : undefined,
  }),
  component: NewRfpPage,
});

function NewRfpPage() {
  const { templateId } = Route.useSearch();
  if (!templateId) return <TemplatePicker />;
  const { data: template, isLoading } = useTemplate(templateId);
  const save = useSaveRfp();
  const nav = useNavigate();
  if (isLoading || !template) return <Skeleton />;

  return (
    <TemplateForm
      template={template}
      mode="save"
      topLevelAction="create"
      onSave={(values) => save.mutate(
        { method: 'save', action: 'create', appId: env.appId, subject: '...', template: { id: template.id, schema: values } },
        { onSuccess: (rfp) => nav({ to: '/rfps/$id/edit', params: { id: String(rfp.id) } }) }
      )}
      onSubmit={(values) => /* FE-11 handoff or direct */}
    />
  );
}
```

## Testing
- **Integration:**
  - New: pick template via `?templateId=` → form renders → fill → Save → mock 201 → navigate to `/rfps/:id/edit`.
  - Edit: navigate to `/rfps/:id/edit` → form prefilled with prior `schema` → mutate one row → Save → mock 200 → form remains, toast.
  - Submit (no FE-11): leave a mandatory field empty → click Submit → RHF errors surface → submit blocked.
  - Submit (no FE-11): all required filled → click Submit → mock 200 → navigate to `/rfps/:id`.
  - Cancel with dirty form → confirm dialog.
- **Round-trip check:** edit → save → reload `/rfps/:id/edit` → previously-edited row still reflects the change.

## Acceptance Criteria
- [ ] `/rfps/new?templateId=N` opens the form for that template.
- [ ] `/rfps/new` without `templateId` shows a picker → choosing one updates the URL search param.
- [ ] `/rfps/:id/edit` loads RFP detail and renders `<TemplateForm>` prefilled.
- [ ] Save Draft posts with `method='save'`; the RFP's `status` becomes `drafted` server-side.
- [ ] Submit either hands off to FE-11's picker OR (feature-flag fallback) posts with `method='submit'`.
- [ ] After save, list cache (FE-9) is invalidated; new draft visible there.
- [ ] Subject field is required only when method=submit.
- [ ] Cancel-with-dirty triggers a confirmation.
- [ ] All errors flow through `ApiError`.

## Open Questions
- [ ] Backend payload: when `action: 'edit'`, does the backend require the RFP `id` at the top level or under `template`? `docs/FLOWS/rfp-creation-flow.md` shows top-level — confirm and align `RfpSavePayload`.
- [ ] What does the RFP detail endpoint return for the `schema`? Spec says the RFP carries a frozen `template` JSON + line items; FE-10 must reconstruct `FormState` for `<TemplateForm>` defaults. Define a `deserialise` helper alongside `serialise` in FE-8 (already listed in FE-8 files).
- [ ] If a user edits a *submitted* RFP, what ACTIONS are valid? Per CLAUDE.md, edit-after-submit isn't fully wired; for v1, disable Edit when status !== `drafted`. List shows the Edit action only for drafted rows already.

## Cross-references
- [`/docs/FLOWS/rfp-creation-flow.md`](../FLOWS/rfp-creation-flow.md).
- Upstream: [FE-7](./FE-7-template-view.md), [FE-8](./FE-8-form-engine.md), [FE-9](./FE-9-rfp-list.md), [FE-0](./FE-0-foundation.md).
- Downstream: [FE-11](./FE-11-rfp-submit.md) (consumes `useSaveRfp`), [FE-12](./FE-12-rfp-detail-status.md) (renders the saved RFP).
