# FE-9 — RFP List

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Render `/rfps` — a paginated, searchable list of RFPs with status filter chips. Independent of the form engine and the create/edit critical path; can ship in parallel with FE-7/FE-8/FE-10. Status filter chips include `drafted` and `submitted` (the values the backend sets today); deferred values (`pending`, `in-progress`, `completed`, `cancelled`, plus the F2/F3-introduced `sending`/`sent`/`partial`/`failed`) appear greyed out until they're known to be settable.

## Dependencies
- **FE-0** — `api`, `endpoints.rfp.list` (note: `/rfp/` not `/api/rfp/` per known backend bug), `qk.rfp.list`, primitives.
- **FE-4** — sidebar slot.

## Scope

### In scope
- Authed route `/_authed/rfps/index.tsx`.
- DataTable columns: Code, Subject, Status badge, Created at, Created by, Actions menu (View / Edit if `drafted`).
- Status filter chips: clicking a chip sets `?status=`; clicking the active chip clears the filter.
- Search by `code` and `subject` via the documented query param.
- Pagination identical in behaviour to FE-5.
- "New RFP" button → `/rfps/new` (target lands in FE-10).
- Empty state with a CTA to "Create your first RFP".
- Sidebar entry "RFPs".

### Out of scope (handled elsewhere)
- Detail view → **FE-12** (deferred-stub).
- Create / edit → **FE-10**.
- Filtering by template, supplier, date range — defer to a follow-up.

## Implementation Plan
1. Define `RfpSummary`, `RfpListQuery`, `RfpListResponse` in `features/rfp/types.ts` (only fields needed for the list — full RFP type lives in FE-12).
2. Add `features/rfp/api.ts` with `listRfps(query)`.
3. Add `features/rfp/queries.ts` with `useRfpsList(query)`.
4. Build the route + table; wire status chips.
5. Add MSW handlers + a fixture set covering each documented status.
6. Tests.

## Files

### To create
- `apps/web/src/features/rfp/types.ts`
- `apps/web/src/features/rfp/api.ts`
- `apps/web/src/features/rfp/queries.ts`
- `apps/web/src/features/rfp/StatusChips.tsx`
- `apps/web/src/routes/_authed/rfps/index.tsx`
- `apps/web/src/features/rfp/__tests__/list.test.tsx`

### To modify
- `apps/web/src/components/shell/Sidebar.tsx` — register sidebar item.
- `apps/web/src/test/handlers.ts` — RFP list handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/rfp/types.ts
export type RfpStatus =
  | 'drafted' | 'submitted'
  // not yet emitted by backend — surface as disabled chips:
  | 'pending' | 'in-progress' | 'completed' | 'cancelled'
  // post-backend-F2/F3 (FE-12 lights these up):
  | 'sending' | 'sent' | 'partial' | 'failed';

export interface RfpSummary {
  id: number;
  code: string | null;             // backend `generateRfpCode` is currently a stub — may be null
  subject: string;
  status: RfpStatus;
  templateId: number;
  appId: number;
  creatorId: number;
  createdAt: string;
  updatedAt: string;
}

export interface RfpListQuery {
  page: number;
  limit: number;
  status?: RfpStatus;
  search?: string;
}

export interface RfpListResponse {
  items: RfpSummary[];
  countData: { pages: number; limit: number; totalCount: number; page: number };
}
```

```ts
// queries.ts
export function useRfpsList(query: RfpListQuery): UseQueryResult<RfpListResponse>;
```

## Code Sketches

```tsx
// features/rfp/StatusChips.tsx
const ENABLED: RfpStatus[] = ['drafted', 'submitted'];
const FUTURE: RfpStatus[] = ['sending', 'sent', 'partial', 'failed', 'cancelled'];

export function StatusChips({ value, onChange }: { value?: RfpStatus; onChange: (v?: RfpStatus) => void }) {
  return (
    <div className="flex gap-2">
      {ENABLED.map((s) => (
        <Chip key={s} active={value === s} onClick={() => onChange(value === s ? undefined : s)}>{s}</Chip>
      ))}
      {FUTURE.map((s) => (
        <Chip key={s} disabled title="Available once email infra ships">{s}</Chip>
      ))}
    </div>
  );
}
```

## Testing
- **Integration:**
  - List loads and paginates.
  - Search debounces and updates URL.
  - Clicking the `submitted` chip filters the list; clicking again clears.
  - Empty state renders the "Create your first RFP" CTA.
  - Row "Edit" action is hidden for non-`drafted` rows.

## Acceptance Criteria
- [ ] `/rfps` renders the table with the documented columns.
- [ ] Status filter chips work; future chips are disabled with a tooltip.
- [ ] Search + pagination state lives in the URL.
- [ ] "New RFP" button navigates to `/rfps/new`.
- [ ] Sidebar entry "RFPs" present.
- [ ] Query keys are namespaced under `appId` per FE-0's `qk` factory.
- [ ] `endpoints.rfp.list` is the only place that knows about the `/rfp/` vs `/api/rfp/` bug.

## Open Questions
- [ ] Does the documented list endpoint support `status` and `search` query params? `docs/FLOWS/rfp-creation-flow.md` doesn't enumerate query params — confirm. If unsupported, fall back to client-side filtering temporarily and file a backend ticket.
- [ ] Do we want a "Mine vs All" toggle on the list? Currently the backend filters by creator; defer the toggle until multi-user collaboration ships.

## Cross-references
- [`/CLAUDE.md`](../../CLAUDE.md) §Known Issues (RFP routes mounted at `/rfp/`).
- Upstream: [FE-0](./FE-0-foundation.md), [FE-4](./FE-4-app-shell.md).
- Downstream: [FE-12](./FE-12-rfp-detail-status.md) (detail), [FE-10](./FE-10-rfp-create-edit.md) (create button target).
