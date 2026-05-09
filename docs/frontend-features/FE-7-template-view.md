# FE-7 — Template List + Read-Only View

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Render the list of available templates and a read-only "spec" view of any single template — sections, fields, types, mandatory flags, system keys. This is intentionally non-interactive; FE-8 (the form engine) is what actually instantiates a template into a working form. Splitting the two slices gives FE-8 real fixture payloads to design against and de-risks the engine.

## Dependencies
- **FE-0** — `api`, `endpoints.template.*`, `qk.template.*`.
- **FE-4** — sidebar slot.

## Scope

### In scope
- Authed route `/_authed/templates/index.tsx` listing every template (paginated if backend supports it; otherwise fetch-all).
- Authed route `/_authed/templates/:id` rendering sections in order; for each section, rows of fields with `key`, `label`, `type`, `mandatory` badge, and `systemKey` chip when present.
- Distinct visual treatment for `sectiontype: 'form'` vs `'table'`.
- Sidebar entry "Templates".
- "Use this template" CTA on the detail page links to `/rfps/new?templateId=:id` (target page lands in FE-10).

### Out of scope (handled elsewhere)
- Template authoring (drag/drop builder) — deferred; intentionally not in v1 per the planning decision.
- Template versioning / publish / archive — backend doesn't expose this.
- Field validation preview — that's FE-8's job.

## Implementation Plan
1. Define `Template`, `Section`, `Field` types in `features/template/types.ts` matching `docs/DB_SCHEMA.md` and `docs/FLOWS/rfp-creation-flow.md`.
2. Add `features/template/api.ts` with `listTemplates`, `getTemplate(id)`.
3. Add `features/template/queries.ts` with `useTemplatesList` and `useTemplate(id)`.
4. Build the two routes.
5. Build small read-only render components: `<TemplateSpec>`, `<SectionSpec>`, `<FieldSpec>`.
6. Add MSW fixtures for at least two templates (one with both FORM and TABLE sections) — these become FE-8's primary fixtures.

## Files

### To create
- `apps/web/src/features/template/types.ts`
- `apps/web/src/features/template/api.ts`
- `apps/web/src/features/template/queries.ts`
- `apps/web/src/components/template/TemplateSpec.tsx`
- `apps/web/src/components/template/SectionSpec.tsx`
- `apps/web/src/components/template/FieldSpec.tsx`
- `apps/web/src/routes/_authed/templates/index.tsx`
- `apps/web/src/routes/_authed/templates/$id/index.tsx`
- `apps/web/src/test/fixtures/templates.ts` *(seed fixtures consumed by FE-8 tests too)*
- `apps/web/src/features/template/__tests__/view.test.tsx`

### To modify
- `apps/web/src/components/shell/Sidebar.tsx` — register sidebar item.
- `apps/web/src/test/handlers.ts` — template list + detail handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/template/types.ts (mirrors docs/DB_SCHEMA.md)
export type FieldType =
  | 'text' | 'number' | 'date' | 'boolean'
  | 'select' | 'multiselect' | 'radio' | 'checkbox'
  | 'dataLookup' | 'formula';

export type SectionType = 'form' | 'table';

export interface Field {
  id: number;
  key: string;
  label: string;
  type: FieldType;
  mandatory: boolean;
  systemKey?: 'price' | 'product' | 'code' | string; // see CLAUDE.md §systemKey
  options?: { label: string; value: string | number }[]; // for select/radio/checkbox/multiselect
  // formula / dataLookup specifics — additional fields per backend doc
}

export interface Section {
  id: number;
  key: string;
  label: string;
  sectiontype: SectionType;
  fields: Field[];
  // for TABLE sections, default rows are NOT in the template — they come from the RFP payload
}

export interface Template {
  id: number;
  label: string;
  sections: Section[];
}
```

These types are imported by FE-8, FE-10, FE-12, FE-13.

## Code Sketches

```tsx
// components/template/FieldSpec.tsx (read-only)
export function FieldSpec({ field }: { field: Field }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 py-1">
      <div>
        <div className="text-sm font-medium">{field.label}</div>
        <div className="text-xs text-muted-foreground">{field.key}</div>
      </div>
      <Badge variant="secondary">{field.type}</Badge>
      {field.mandatory && <Badge>required</Badge>}
      {field.systemKey && <Badge variant="outline">sys: {field.systemKey}</Badge>}
    </div>
  );
}
```

## Testing
- **Integration:** mock template list → renders titles + section counts; navigating to detail renders all sections + fields with correct badges.
- **Unit:** `<FieldSpec>` renders the `mandatory` and `systemKey` chips conditionally.

## Acceptance Criteria
- [ ] `/templates` lists templates by label.
- [ ] `/templates/:id` renders sections in order; FORM and TABLE sections distinguished visually.
- [ ] Each field shows label, key, type, mandatory + systemKey chips.
- [ ] "Use this template" CTA links to `/rfps/new?templateId=:id`.
- [ ] Two MSW fixture templates exist (1 FORM-only, 1 mixed FORM+TABLE) and pass detail rendering.
- [ ] Sidebar entry "Templates" present.

## Open Questions
- [ ] Does the backend have a documented template-list endpoint shape? `docs/FLOWS/rfp-creation-flow.md` references templates as input; the listing endpoint isn't documented. **Confirm with backend owner**; if unavailable, FE-7 ships against MSW fixtures only and the integration awaits a backend ticket.
- [ ] Are templates seeded from a migration / seed script? If yes, document the seed location so reviewers can rebuild test data deterministically.

## Cross-references
- [`/docs/DB_SCHEMA.md`](../DB_SCHEMA.md) — Template / Section / Field models.
- [`/docs/FLOWS/rfp-creation-flow.md`](../FLOWS/rfp-creation-flow.md) — Template usage in RFP submission.
- Upstream: [FE-0](./FE-0-foundation.md), [FE-4](./FE-4-app-shell.md).
- Downstream: [FE-8](./FE-8-form-engine.md) (consumes Template types + fixtures), [FE-10](./FE-10-rfp-create-edit.md) (uses "Use this template" CTA target).
