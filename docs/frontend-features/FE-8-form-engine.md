# FE-8 — Dynamic Form Engine (FORM + TABLE Renderer)

## Status
Not started   Owner: tbd   Effort: ~3 days **[RISKIEST SLICE]**

## Goal
Build the dynamic form engine that consumes a `Template` and produces a working RFP form, then serialises back to the exact backend payload shape documented in [`/docs/FLOWS/rfp-creation-flow.md`](../FLOWS/rfp-creation-flow.md). Supports two section types (FORM, TABLE), the dictionary-keyed row shape (`rowOrder` + `rows`), per-row `ACTIONS` (create / edit / `DElETE`), `systemKey` value routing, and SAVE-vs-SUBMIT validation strictness. This component is reused by FE-10 (RFP create/edit), FE-12 (RFP detail in read-only mode), and FE-13 (supplier portal in quote mode).

This is the riskiest slice because the backend payload shape is unusual (rows as a dictionary, not an array), `useFieldArray` doesn't fit out of the box, and three modes of strictness (SAVE / SUBMIT / read-only) interact with field-level mandatoriness and `systemKey` routing.

## Dependencies
- **FE-0** — RHF + Zod wiring, design system primitives.
- **FE-7** — `Template` / `Section` / `Field` types + MSW fixtures.

## Spike Recommendation (do this first)

**Before committing to the 3-day estimate, run a half-day spike:**

1. Pick the FE-7 mixed FORM+TABLE fixture template.
2. Render it with a minimal `<TemplateForm>` (RHF + Zod) — proving you can register both section kinds in the same form.
3. Round-trip an existing RFP through "edit": load → mutate one FORM field → add a row → mark a row `DElETE` → click submit → verify the produced JSON matches `docs/FLOWS/rfp-creation-flow.md` byte-for-byte.
4. Verify SAVE-vs-SUBMIT modes produce different validation errors against a fixture with mandatory fields.

**If the spike runs past half a day**, split this slice:
- **FE-8a** — FORM-section rendering only.
- **FE-8b** — TABLE engine (rowOrder + rows + ACTIONS).
FE-10 then blocks only on FE-8b. The dependency graph in `README.md` already supports this fallback.

## Scope

### In scope
- `<TemplateForm>` component accepting `template`, `mode: 'save' | 'submit' | 'readonly' | 'quote'`, `defaultValues`, and `onSubmit`.
- FORM section: each field rendered per its `type` (text/number/date/boolean/select/multiselect/radio/checkbox/dataLookup-stub/formula-readonly).
- TABLE section: a `<DynamicTable>` that manages `rowOrder` and `rows` as the source of truth. Supports add row, edit cell, delete row (sets `action: 'delete'` rather than splicing — matches backend ACTIONS contract). Existing rows from `defaultValues` carry their backend `id`.
- Custom hook `useDictArray<T>(initial, idFn)` that wraps RHF state for the `rowOrder + rows` shape, since `useFieldArray` works on flat arrays. Exposes `add`, `markDelete`, `update`, `iterate`. **This hook is the load-bearing primitive of the entire engine.**
- Dynamic Zod schema built per template + mode:
  - SAVE mode: every field optional except trivially required (numbers must be numbers, dates must be dates).
  - SUBMIT mode: every `mandatory: true` field is required; cross-field rules can be added via a hook later.
  - READONLY mode: no validation, all inputs disabled.
  - QUOTE mode (for FE-13): only fields tagged with specific `systemKey` (price, leadTimeDays, remarks) are editable.
- `serialiseTemplateForm(values, template, mode, action)` → produces the exact `template.schema` payload from `docs/FLOWS/rfp-creation-flow.md`. Routes values to `fieldResponses` by default; if `field.systemKey` is set, ALSO emit it (the backend resolves systemKey on the server, but the wire shape passes the value through `fieldResponses[field.key]` unchanged — the spike must confirm this).
- ACTIONS preserved exactly: `'create' | 'edit' | 'delete'`. Note the backend constant key is `ACTIONS.DElETE` (capital E) but the value is `'delete'` — the wire format uses the lowercase string. **Do not introduce any reference to the constant key spelling on the client.**
- Dev-only sandbox route `/_authed/__dev/form-sandbox` rendering the engine against each fixture template, with a button "show payload" that prints the serialised JSON to the page.

### Out of scope (handled elsewhere)
- Wiring to RFP create/edit routes → **FE-10**.
- Wiring to RFP detail (readonly mode) → **FE-12**.
- Wiring to supplier portal (quote mode) → **FE-13**.
- DataLookup remote-search UI — render a stub `<DataLookupField>` that accepts a value but doesn't fetch. Real implementation is a follow-up.
- Formula evaluation — render the field as read-only displaying a placeholder. Real implementation is a follow-up.
- Conditional fields ("if A=foo then show B") — backend doesn't expose conditions yet.
- File / attachment fields — not in the documented FIELD_TYPES.

## Implementation Plan
1. **Spike** (half day) per the Spike Recommendation section above.
2. Implement `useDictArray<T>` hook + 100% unit-test coverage (the dictionary-shaped row state is the highest-risk primitive).
3. Implement `buildZodSchema(template, mode)` that walks sections + fields and produces a Zod schema. Unit-test against fixtures.
4. Implement `serialiseTemplateForm(values, template, mode, action)`. Unit-test against the documented payload shape: round-trip a fixture RFP through `defaultValues → form → serialise` and assert deep equality.
5. Implement field renderers (`<TextField>`, `<NumberField>`, `<DateField>`, `<BooleanField>`, `<SelectField>`, `<MultiSelectField>`, `<RadioField>`, `<CheckboxField>`, `<DataLookupField>` stub, `<FormulaField>` readonly).
6. Implement `<DynamicTable>` consuming `useDictArray`. Add row, mark-delete (does NOT remove from `rowOrder`; flips `action: 'delete'`; renders the row visually struck-through), undo-delete.
7. Implement `<TemplateForm>` composing the above.
8. Build the dev sandbox route.
9. Run the round-trip integration test against MSW fixtures from FE-7.
10. Document the public API in `Contracts Exported` and link from FE-10/FE-12/FE-13.

## Files

### To create
- `apps/web/src/features/form-engine/types.ts`
- `apps/web/src/features/form-engine/buildZodSchema.ts`
- `apps/web/src/features/form-engine/serialise.ts`
- `apps/web/src/features/form-engine/deserialise.ts`
- `apps/web/src/features/form-engine/useDictArray.ts`
- `apps/web/src/features/form-engine/TemplateForm.tsx`
- `apps/web/src/features/form-engine/DynamicTable.tsx`
- `apps/web/src/features/form-engine/fields/TextField.tsx`
- `apps/web/src/features/form-engine/fields/NumberField.tsx`
- `apps/web/src/features/form-engine/fields/DateField.tsx`
- `apps/web/src/features/form-engine/fields/BooleanField.tsx`
- `apps/web/src/features/form-engine/fields/SelectField.tsx`
- `apps/web/src/features/form-engine/fields/MultiSelectField.tsx`
- `apps/web/src/features/form-engine/fields/RadioField.tsx`
- `apps/web/src/features/form-engine/fields/CheckboxField.tsx`
- `apps/web/src/features/form-engine/fields/DataLookupField.tsx` *(stub)*
- `apps/web/src/features/form-engine/fields/FormulaField.tsx` *(readonly stub)*
- `apps/web/src/features/form-engine/fields/index.ts`
- `apps/web/src/routes/_authed/__dev/form-sandbox.tsx` *(dev-only)*
- `apps/web/src/features/form-engine/__tests__/useDictArray.test.ts`
- `apps/web/src/features/form-engine/__tests__/buildZodSchema.test.ts`
- `apps/web/src/features/form-engine/__tests__/serialise.test.ts`
- `apps/web/src/features/form-engine/__tests__/round-trip.test.tsx`

### To modify
- `apps/web/src/test/fixtures/templates.ts` — add an "RFP edit" fixture: a Template + an existing RFP payload + the expected serialised JSON for both SAVE and SUBMIT.

## State / Schema

The form's internal state shape (RHF):

```ts
type FormState = {
  [sectionKey: string]: {
    fieldResponses: Record<string, unknown>;       // for FORM sections
    rowOrder: string[];                            // for TABLE sections
    rows: Record<string, {
      key: string;                                  // === outer dict key
      action: 'create' | 'edit' | 'delete';
      id?: number;                                 // present when action !== 'create'
      sno: number;
      status?: string;
      fieldResponses: Record<string, unknown>;
    }>;
  };
};
```

Serialised wire shape (target):

```ts
{
  method: 'submit' | 'save',
  action: 'create' | 'edit',
  appId: number,
  template: { id: number, schema: FormState },
}
```

(The wire shape uses the same `FormState` for `template.schema`. This is the entire reason the engine matches the backend so directly.)

## Config / Env Vars
None new.

## Packages
None new (RHF + Zod from FE-0).

## Contracts Exported

```ts
// features/form-engine/TemplateForm.tsx
export type TemplateFormMode = 'save' | 'submit' | 'readonly' | 'quote';

export interface TemplateFormProps {
  template: Template;
  mode: TemplateFormMode;
  defaultValues?: FormState;       // shape above
  onSubmit: (values: FormState) => void;
  onSave?: (values: FormState) => void;     // SAVE button click; bypasses submit-mode strictness
  topLevelAction: 'create' | 'edit';        // routes to ACTIONS in the wire shape
  submitting?: boolean;
}
export function TemplateForm(props: TemplateFormProps): JSX.Element;
```

```ts
// features/form-engine/serialise.ts
export interface SerialiseArgs {
  values: FormState;
  template: Template;
  method: 'save' | 'submit';
  action: 'create' | 'edit';
  appId: number;
}
export function serialiseTemplateForm(args: SerialiseArgs): RfpSubmitPayload;
```

```ts
// features/form-engine/useDictArray.ts
export function useDictArray<T extends { key: string }>(opts: {
  initial: { order: string[]; items: Record<string, T> };
  defaultRow: () => T;
}): {
  order: string[];
  items: Record<string, T>;
  add: () => string;            // returns new key
  markDelete: (key: string) => void;
  undoDelete: (key: string) => void;
  update: (key: string, patch: Partial<T>) => void;
  iterate: () => Array<T & { _key: string }>;
};
```

These three exports are the public API of the engine. FE-10/12/13 import only from `features/form-engine/index.ts`.

## Code Sketches

```ts
// features/form-engine/serialise.ts (kernel)
export function serialiseTemplateForm({ values, template, method, action, appId }: SerialiseArgs): RfpSubmitPayload {
  // Walk sections; for FORM sections copy `fieldResponses` through.
  // For TABLE sections preserve the dictionary as-is — already in wire shape.
  // For each TABLE row, ensure `action` is set ('create' for new, 'edit' for existing untouched, 'delete' for marked).
  // Drop rows whose `action === 'create'` AND have no field values yet (empty new rows).
  return {
    method,
    action,
    appId,
    template: { id: template.id, schema: values },
  };
}
```

```ts
// features/form-engine/buildZodSchema.ts (kernel)
export function buildZodSchema(template: Template, mode: TemplateFormMode): z.ZodType<FormState> {
  const sectionSchemas: Record<string, z.ZodType<unknown>> = {};
  for (const section of template.sections) {
    if (section.sectiontype === 'form') {
      sectionSchemas[section.key] = buildFormSection(section, mode);
    } else {
      sectionSchemas[section.key] = buildTableSection(section, mode);
    }
  }
  return z.object(sectionSchemas) as unknown as z.ZodType<FormState>;
}
```

```tsx
// features/form-engine/DynamicTable.tsx (sketch)
export function DynamicTable({ section, mode, name }: { section: Section; mode: TemplateFormMode; name: string }) {
  const { order, items, add, markDelete, update, iterate } = useDictArray({
    initial: /* ... read from RHF defaultValues ... */,
    defaultRow: () => ({ key: nanoid(), action: 'create', sno: order.length + 1, fieldResponses: {} }),
  });
  return (
    <Table>
      {/* header from section.fields */}
      <tbody>
        {iterate().map((row) => (
          <DynamicRow
            key={row._key}
            row={row}
            section={section}
            mode={mode}
            onChange={(patch) => update(row._key, patch)}
            onDelete={() => markDelete(row._key)}
          />
        ))}
      </tbody>
      {mode !== 'readonly' && <Button onClick={add}>Add row</Button>}
    </Table>
  );
}
```

## Testing
- **Unit (load-bearing):**
  - `useDictArray`: add increments order; markDelete flips `action`, does not remove from order; undoDelete restores prior `action`; update merges patches.
  - `buildZodSchema(template, 'save')`: mandatory fields are optional.
  - `buildZodSchema(template, 'submit')`: mandatory fields are required; mismatch produces RHF errors at the right paths.
  - `serialiseTemplateForm`: produces an output identical to the documented payload from `docs/FLOWS/rfp-creation-flow.md` for both SAVE and SUBMIT.
- **Integration:**
  - Render fixture template → fill FORM section + add 3 rows → click SUBMIT → captured payload deep-equals expected.
  - Edit-mode round trip: load fixture RFP → mark a row deleted → submit → row appears in output with `action: 'delete'` and the original `id`.
  - SAVE mode: leave all fields empty → submit succeeds; payload contains empty values.
- **Sandbox (manual):** `/__dev/form-sandbox` renders all fixtures and the live serialised JSON.

## Acceptance Criteria
- [ ] Spike report committed (or this card explicitly marks the spike result and any FE-8a/8b split).
- [ ] `useDictArray` is fully unit-tested.
- [ ] `<TemplateForm>` renders FORM and TABLE sections from a Template.
- [ ] All 10 FIELD_TYPES render (DataLookup + Formula are stubs but accept values).
- [ ] SAVE submission produces a valid payload regardless of mandatory-field emptiness.
- [ ] SUBMIT mode blocks submission when any `mandatory: true` field is empty; errors surface at the correct field paths.
- [ ] Row delete flips `action: 'delete'` (does not splice); undo restores prior action.
- [ ] `serialiseTemplateForm` output matches `docs/FLOWS/rfp-creation-flow.md` byte-for-byte for the fixtures.
- [ ] Round-trip integration test passes for an "edit" scenario.
- [ ] `readonly` and `quote` modes are wired (gated edit by `systemKey` for QUOTE) — they don't have to be visually polished, just correct.
- [ ] `/__dev/form-sandbox` works in dev.

## Open Questions
- [ ] Does the backend require `sno` to be re-numbered on submit, or does it accept gaps? Spike must confirm. **Recommend** keep gaps; let backend re-number.
- [ ] Behaviour when a TABLE section has zero rows on SUBMIT — is it valid? Recommend allowing it; backend can reject if it wants. Document in spike.
- [ ] How does `systemKey` interact with serialisation? Per CLAUDE.md the backend reads systemKey and routes to LineItem columns; the wire format passes the value through `fieldResponses[field.key]` unchanged. Spike must confirm; if wrong, this card needs revision.
- [ ] Formula fields — display-only with a placeholder is fine for v1. Track real evaluation as a follow-up slice.
- [ ] DataLookup — for v1 ship a stubbed `<Combobox>` that lets you type any value but doesn't fetch. Wire real lookups when the backend lookup endpoint is documented.

## Cross-references
- [`/docs/FLOWS/rfp-creation-flow.md`](../FLOWS/rfp-creation-flow.md) §RFP Submission Payload Schema.
- [`/CLAUDE.md`](../../CLAUDE.md) §METHODS and ACTIONS, §Template System (`systemKey`), §Known Issues (`ACTIONS.DElETE` typo).
- Upstream: [FE-7](./FE-7-template-view.md) (types + fixtures).
- Downstream: [FE-10](./FE-10-rfp-create-edit.md), [FE-12](./FE-12-rfp-detail-status.md), [FE-13](./FE-13-supplier-portal.md).
