# FE-12 — RFP Detail + Per-Supplier Delivery / Response Status

## Status
**Deferred-stub** (lights up when backend F2/F3/F6 merge)   Owner: tbd   Effort: ~1.5 days

This slice follows the [F8 deferred-stub pattern](../email-features/F8-ai-processing.md): ship the route + the no-op shell + the typed contract; flip the feature flag when backend dependencies land.

## Goal
Render `/rfps/:id` — full RFP view with header, line-items grid (read-only via FE-8), and a per-supplier table showing invitation/delivery/response status. Statuses transition `invited → sending → sent / partial / failed → responded`. The UI polls every 5s while any row is in a non-terminal state, then stops. Until backend F2/F3/F6 merge, only `invited` and `responded` are observable; the page renders a banner explaining the limitation.

## Dependencies
- **FE-8** — `<TemplateForm>` in `readonly` mode renders the saved schema.
- **FE-9** — RFP list links here.
- **FE-10** — `useRfp(id)`, `Rfp` type.
- **Backend F2** — outbound email status updates.
- **Backend F3** — RFP→email integration (replyToken, dispatch).
- **Backend F6** — `RFPSupplier.respondedAt`, admin endpoints (also relevant to FE-14).

## Scope

### In scope (today, before backend gates lift)
- Authed route `/_authed/rfps/$id/index.tsx`.
- Header: subject, code, status badge, created at, "Edit draft" link if `status === 'drafted'`.
- Line-items grid: `<TemplateForm template={rfp.templateSnapshot} mode="readonly" defaultValues={rfp.schema} />`.
- Per-supplier table with columns: Supplier, Email, Invitation status (`invited`), Response status (`responded` if `respondedAt`), Last update.
- Banner: "Delivery telemetry pending email infrastructure (backend F2/F3)" — visible until the env feature flag is flipped.
- TanStack Query polling: `refetchInterval` is `5000` only when any row's status is in the non-terminal set; otherwise `false`.

### In scope (becomes observable when backend lands)
- Pills for `sending`, `sent`, `partial`, `failed`.
- Hover details: bounce reason, delivery timestamp, last error.
- Per-supplier "Resend" button (calls a backend endpoint introduced in F2/F3).
- "View inbound" link if F6 admin can resolve to an inbound email row (jumps to FE-14 detail).

### Out of scope (handled elsewhere)
- Editing a non-draft RFP — disabled until backend supports it.
- Quote display — that's a future slice once backend exposes `SupplierLineItemQuote` per RFP.
- Manual-match UI — **FE-14**.
- Inbound email parsing — **F8** territory (deferred).

## Implementation Plan
1. Build the route shell + header with status badge.
2. Render the read-only form via FE-8.
3. Build `<RfpSupplierStatusTable>` consuming `rfp.suppliers` (the `RFPSupplier[]` returned by detail).
4. Implement polling with `refetchInterval: (q) => isNonTerminal(q.state.data) ? 5000 : false`.
5. Add the deferred-stub banner gated by `env.VITE_DELIVERY_STATUS_LIVE` (default `false`).
6. Add MSW fixtures for both states: stub-mode (only `invited` + `responded`) and live-mode (full status matrix).
7. Tests for both modes.

## Files

### To create
- `apps/web/src/routes/_authed/rfps/$id/index.tsx`
- `apps/web/src/features/rfp/RfpSupplierStatusTable.tsx`
- `apps/web/src/features/rfp/RfpStatusBadge.tsx`
- `apps/web/src/features/rfp/__tests__/detail.test.tsx`

### To modify
- `apps/web/src/features/rfp/types.ts` — add `RfpSupplierLink` (id, supplierId, status, invitedAt, respondedAt, deliveryStatus).
- `apps/web/src/features/rfp/queries.ts` — `useRfp(id)` already exists from FE-10; here we add the polling configuration as a separate hook `useRfpDetailPolled(id)`.
- `apps/web/.env.example` — add `VITE_DELIVERY_STATUS_LIVE=false`.

## Config / Env Vars
```bash
VITE_DELIVERY_STATUS_LIVE=false   # flip true once backend F2/F3 land
```

When `false`, the banner is shown; future statuses render as disabled. When `true`, full matrix is enabled.

## Packages
None new.

## Contracts Exported

```ts
// features/rfp/types.ts (added)
export type RfpSupplierStatus = 'invited' | 'sending' | 'sent' | 'partial' | 'failed' | 'responded';

export interface RfpSupplierLink {
  id: number;
  rfpId: number;
  supplierId: number;
  supplierName: string;
  supplierEmail: string;
  status: RfpSupplierStatus;
  invitedAt: string;
  respondedAt: string | null;
  // Populated by backend F2/F3 when ready:
  lastDeliveryEvent?: string;       // 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'
  lastDeliveryAt?: string | null;
  lastError?: string | null;
}
```

```ts
// queries.ts (added)
export function useRfpDetailPolled(id: number): UseQueryResult<Rfp>;
function isNonTerminal(rfp?: Rfp): boolean; // 'sending' | 'invited' (waiting on first delivery event)
```

## Code Sketches

```ts
// features/rfp/queries.ts
export function useRfpDetailPolled(id: number) {
  const appId = Number(env.VITE_DEFAULT_APP_ID);
  return useQuery({
    queryKey: qk.rfp.detail(appId, id),
    queryFn: () => getRfp(id),
    refetchInterval: (q) => (isNonTerminal(q.state.data) ? 5_000 : false),
    refetchOnWindowFocus: true,
  });
}
```

## Testing
- **Integration (stub mode):** banner visible; only `invited` + `responded` pills render; polling stops once all rows terminal.
- **Integration (live mode):** full status matrix renders; polling fires every 5s until terminal; resend button appears.

## Acceptance Criteria
- [ ] `/rfps/:id` renders header + read-only line items + supplier status table.
- [ ] Polling activates only when any row is non-terminal.
- [ ] Banner gated by `VITE_DELIVERY_STATUS_LIVE`.
- [ ] Edit-draft link visible only for `status === 'drafted'`.
- [ ] All statuses styled distinctly (`<RfpStatusBadge>`).
- [ ] When backend lands, no frontend code change is required to surface the new statuses — only flip the env flag and verify pills.

## Open Questions
- [ ] Exact response shape for the per-supplier delivery state — F2/F3 docs name `EmailMessage.status`. The detail endpoint must aggregate this onto each `RFPSupplier` row. **Backend ticket required.**
- [ ] Resend endpoint — when does F2 expose one? Track for follow-up.
- [ ] Should the page link to the inbound email rows (FE-14)? Yes once F5/F6 land — render a "View reply" link when `respondedAt` is set and the inbound id is available.

## Cross-references
- [`/docs/email-features/F2-outbound-email-system.md`](../email-features/F2-outbound-email-system.md).
- [`/docs/email-features/F3-rfp-email-integration.md`](../email-features/F3-rfp-email-integration.md).
- [`/docs/email-features/F6-supplier-response-state.md`](../email-features/F6-supplier-response-state.md).
- Upstream: [FE-8](./FE-8-form-engine.md), [FE-9](./FE-9-rfp-list.md), [FE-10](./FE-10-rfp-create-edit.md).
- Downstream: [FE-14](./FE-14-admin-inbound.md) (link to inbound rows).
