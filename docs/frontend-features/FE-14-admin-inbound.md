# FE-14 — Admin Inbound (Unmatched List + Detail + Manual Match)

## Status
**Deferred-stub** (lights up when backend F6 merges)   Owner: tbd   Effort: ~1.5 days

This slice follows the [F8 deferred-stub pattern](../email-features/F8-ai-processing.md): UI shell ships today against fixtures; live wiring requires backend F6's admin endpoints.

## Goal
Surface the `unmatched` inbound emails that backend F4/F5 capture — let an operator inspect a single inbound, manually map it to an `(rfpId, supplierId)`, and trigger `markRfpSupplierResponded`. Mirrors the admin endpoints documented in [F6](../email-features/F6-supplier-response-state.md): `GET /api/admin/inbound/unmatched`, `GET /api/admin/inbound/:id`, `POST /api/admin/inbound/:id/manual-match`.

## Dependencies
- **FE-0** — `endpoints.admin.*`, `qk.admin.*`.
- **FE-4** — sidebar slot (gated behind `VITE_SHOW_ADMIN`).
- **Backend F6** — admin endpoints + `markRfpSupplierResponded`.

## Scope

### In scope (today, behind feature flag)
- Authed route `/_authed/admin/inbound/index.tsx` — paginated list of unmatched inbound rows; cursor-based pagination per F6 spec (`limit=50&cursor=<lastId>`).
- Authed route `/_authed/admin/inbound/$id/index.tsx` — full detail with raw payload (collapsible JSON), parsed fields (`from`, `subject`, `bodyText`, `inReplyTo`, `references`, `receivedAt`).
- Manual-match dialog: pick RFP via async-search combobox (queries FE-9's list endpoint), pick supplier via FE-5's list endpoint, confirm.
- After confirm, success toast + remove the row from the unmatched list.
- Sidebar group "Admin" with the "Inbound" item, gated by `VITE_SHOW_ADMIN=true`.

### Out of scope (handled elsewhere)
- Bulk match — one inbound at a time in v1.
- Audit log of who matched what — backend F6 tracks via timestamps; UI display deferred.
- Auto-suggested matches — F5's job server-side; UI surfaces whatever F5/F6 suggest.
- AI-extracted quote display — F8 territory, deferred.

## Implementation Plan
1. Add types matching F6's response shapes.
2. Add `features/admin/api.ts` with `listUnmatched`, `getInbound`, `manualMatch`.
3. Add `features/admin/queries.ts` with `useUnmatchedInbound`, `useInbound`, `useManualMatch`.
4. Build `routes/_authed/admin/inbound/index.tsx` (list) and `routes/_authed/admin/inbound/$id/index.tsx` (detail).
5. Build `<ManualMatchDialog>` with two async-search comboboxes (RFP + Supplier).
6. Wire MSW fixtures.
7. Tests.

## Files

### To create
- `apps/web/src/features/admin/types.ts`
- `apps/web/src/features/admin/api.ts`
- `apps/web/src/features/admin/queries.ts`
- `apps/web/src/features/admin/ManualMatchDialog.tsx`
- `apps/web/src/routes/_authed/admin/inbound/index.tsx`
- `apps/web/src/routes/_authed/admin/inbound/$id/index.tsx`
- `apps/web/src/features/admin/__tests__/inbound.test.tsx`

### To modify
- `apps/web/src/components/shell/Sidebar.tsx` — add Admin group gated by `VITE_SHOW_ADMIN`.
- `apps/web/src/test/handlers.ts` — admin inbound handlers.

## Config / Env Vars
Already covered by FE-4's `VITE_SHOW_ADMIN`. No new env.

## Packages
None new.

## Contracts Exported

```ts
// features/admin/types.ts
export interface InboundEmail {
  id: number;
  status: 'received' | 'matched' | 'unmatched' | 'failed';
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  inReplyTo: string | null;
  references: string | null;
  rfpId: number | null;
  supplierId: number | null;
  matchedBy: 'plus_address' | 'in_reply_to' | 'references' | 'from_email' | 'manual' | null;
  rawPayload: unknown;
  receivedAt: string;
  processedAt: string | null;
}

export interface UnmatchedListResponse {
  items: InboundEmail[];
  nextCursor: number | null;
}

export interface ManualMatchInput {
  inboundEmailId: number;
  rfpId: number;
  supplierId: number;
}
```

```ts
// features/admin/queries.ts
export function useUnmatchedInbound(opts: { limit?: number; cursor?: number }): UseQueryResult<UnmatchedListResponse>;
export function useInbound(id: number): UseQueryResult<InboundEmail>;
export function useManualMatch(): UseMutationResult<void, ApiError, ManualMatchInput>;
```

## Code Sketches

```tsx
// routes/_authed/admin/inbound/index.tsx
export const Route = createFileRoute('/_authed/admin/inbound/')({ component: UnmatchedListPage });

function UnmatchedListPage() {
  const [cursor, setCursor] = useState<number | undefined>();
  const { data } = useUnmatchedInbound({ limit: 50, cursor });
  return (
    <div>
      <Heading>Unmatched inbound replies</Heading>
      <Table>
        {/* rows: from, subject, receivedAt, action button → /admin/inbound/:id */}
      </Table>
      {data?.nextCursor != null && (
        <Button onClick={() => setCursor(data.nextCursor!)}>Load more</Button>
      )}
    </div>
  );
}
```

```tsx
// features/admin/ManualMatchDialog.tsx (sketch)
export function ManualMatchDialog({ inbound, onClose }: { inbound: InboundEmail; onClose: () => void }) {
  const [rfp, setRfp] = useState<RfpSummary | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const m = useManualMatch();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <RfpAsyncSearch value={rfp} onChange={setRfp} />
        <SupplierAsyncSearch value={supplier} onChange={setSupplier} />
        <Button
          disabled={!rfp || !supplier}
          onClick={() => m.mutate({ inboundEmailId: inbound.id, rfpId: rfp!.id, supplierId: supplier!.id }, { onSuccess: onClose })}
        >Match</Button>
      </DialogContent>
    </Dialog>
  );
}
```

## Testing
- **Integration:**
  - List paginates via `cursor`.
  - Detail renders raw payload (collapsed by default).
  - Manual-match dialog: both fields required; confirming dispatches the mutation; success closes dialog and invalidates the list.
  - Mismatched payload: backend F6 rejects when the `(rfpId, supplierId)` link doesn't exist → 400 surfaces inline.

## Acceptance Criteria
- [ ] `/admin/inbound` lists unmatched rows with cursor-based pagination.
- [ ] `/admin/inbound/:id` renders full detail.
- [ ] Manual-match dialog dispatches `POST /api/admin/inbound/:id/manual-match` with `{ rfpId, supplierId }`.
- [ ] Successful match removes the row from the list.
- [ ] Sidebar item visible only when `VITE_SHOW_ADMIN=true`.
- [ ] Errors flow through `ApiError`.

## Open Questions
- [ ] Auth: is there an admin role on the user object yet? Per CLAUDE.md and `docs/email-features/F6` spec, F6 says "assume an existing `requireAdmin` middleware exists; if not, gate by `req.auth.userId === N` for v1." Frontend gating today is the env flag; once roles ship, swap to a `useAuthRoles()` hook.
- [ ] Should we display the `matchedBy` field for already-matched rows somewhere? Yes — exposes how the system did the match. Render as a chip on the detail page.
- [ ] Bulk operations — defer.

## Cross-references
- [`/docs/email-features/F5-email-mapping.md`](../email-features/F5-email-mapping.md).
- [`/docs/email-features/F6-supplier-response-state.md`](../email-features/F6-supplier-response-state.md).
- Upstream: [FE-0](./FE-0-foundation.md), [FE-4](./FE-4-app-shell.md).
- Cross-link: [FE-12](./FE-12-rfp-detail-status.md) links to admin inbound detail when a supplier responded.
