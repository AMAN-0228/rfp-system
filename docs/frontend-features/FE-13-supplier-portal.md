# FE-13 — Supplier-Facing Portal `/respond/:replyToken`

## Status
**Deferred-stub** (lights up when backend F3 merges)   Owner: tbd   Effort: ~2 days

This slice follows the [F8 deferred-stub pattern](../email-features/F8-ai-processing.md): the UI shell can ship today behind a feature flag against a fixture endpoint; the live wiring requires backend F3 (`replyToken` populated and a public RFP-by-token endpoint exposed).

## Goal
Build the public-facing supplier response portal at `/respond/:replyToken` — no auth, no app shell. Resolves the token to an RFP + invited supplier context, renders the RFP via FE-8 in `quote` mode (header read-only, price/lead-time/remarks editable), and posts the quote back. This is the end of the email-driven RFP loop: a supplier clicks the link in their invitation email and lands here.

## Dependencies
- **FE-0** — `_public/_layout.tsx`, `api`.
- **FE-8** — `<TemplateForm>` `mode='quote'`, `serialiseTemplateForm`.
- **Backend F3** — replyToken on RFPSupplier, public lookup endpoint, public submit endpoint.

## Scope

### In scope (today, behind feature flag)
- Public route `/_public/respond/$replyToken/index.tsx`.
- Layout: minimal — just the company logo, the RFP context (buyer name, RFP subject, due date), the form, and a submit button. No sidebar, no top bar.
- Token resolution: `GET <publicRfpByTokenEndpoint>(replyToken)` → returns `{ rfp, supplier, alreadyResponded }`.
- If `alreadyResponded`, render a "Thanks — your response was recorded" page with the response summary.
- If the token is invalid/expired, render a "This link is no longer valid" page.
- Render the form via `<TemplateForm mode="quote" ...>`. Quote mode (defined in FE-8) gates editability to fields with `systemKey ∈ { price, leadTimeDays, remarks }` (and any others the backend annotates as supplier-fillable).
- Submit posts to a public submit endpoint; on success render the "Thanks" page.

### In scope (post-F3 lands)
- Real backend endpoints replacing the fixture endpoint.
- Token-bound CSRF / single-use semantics (whatever F3 settles on).

### Out of scope
- Supplier login / dashboard — there is no supplier user model.
- Multi-step wizard — the form is single-page.
- Email-thread context display — the quote is the artifact.

## Implementation Plan
1. Stand up `_public/respond/$replyToken/index.tsx` and the three sub-states: loading, invalid, already-responded, ready.
2. Build a fixture MSW endpoint that resolves a known token to a fixture RFP + supplier (use FE-7 fixtures).
3. Render `<TemplateForm mode="quote">` with the RFP's frozen `templateSnapshot` and `schema` as defaults.
4. Wire the submit mutation against the fixture endpoint; success renders the "Thanks" page.
5. Add an `env.VITE_SUPPLIER_PORTAL_LIVE` flag — `false` keeps it on fixtures, `true` switches to the real backend endpoints once F3 lands.
6. Tests covering all four states.

## Files

### To create
- `apps/web/src/routes/_public/respond/$replyToken/index.tsx`
- `apps/web/src/features/portal/api.ts`
- `apps/web/src/features/portal/queries.ts`
- `apps/web/src/features/portal/PortalLayout.tsx`
- `apps/web/src/features/portal/PortalSuccess.tsx`
- `apps/web/src/features/portal/PortalInvalid.tsx`
- `apps/web/src/features/portal/__tests__/respond.test.tsx`

### To modify
- `apps/web/src/lib/endpoints.ts` — add `endpoints.portal.byToken` and `endpoints.portal.submit` (placeholder paths until F3 names them).
- `apps/web/.env.example` — add `VITE_SUPPLIER_PORTAL_LIVE=false`.
- `apps/web/src/test/handlers.ts` — fixture portal endpoints.

## Config / Env Vars
```bash
VITE_SUPPLIER_PORTAL_LIVE=false   # flip true when backend F3 endpoints land
```

## Packages
None new.

## Contracts Exported

```ts
// features/portal/api.ts
export interface PortalContext {
  rfp: Rfp;                                  // includes templateSnapshot + current schema
  supplier: { id: number; name: string; email: string };
  alreadyResponded: boolean;
  buyerName: string;
  dueAt?: string | null;
}

export function getPortalContext(token: string): Promise<PortalContext>;
export function submitQuote(token: string, schema: FormState): Promise<{ ok: true }>;
```

## Code Sketches

```tsx
// routes/_public/respond/$replyToken/index.tsx
export const Route = createFileRoute('/_public/respond/$replyToken/')({ component: PortalPage });

function PortalPage() {
  const { replyToken } = Route.useParams();
  const ctx = usePortalContext(replyToken);
  if (ctx.isLoading) return <PortalLayout><Skeleton /></PortalLayout>;
  if (ctx.error) return <PortalInvalid />;
  if (ctx.data!.alreadyResponded) return <PortalSuccess context={ctx.data!} />;
  return (
    <PortalLayout context={ctx.data!}>
      <TemplateForm
        template={ctx.data!.rfp.templateSnapshot}
        mode="quote"
        defaultValues={ctx.data!.rfp.schema}
        topLevelAction="edit"
        onSubmit={(values) => submitMut.mutate(values)}
      />
    </PortalLayout>
  );
}
```

## Testing
- **Integration:**
  - Valid token → form renders with the RFP's existing line items as defaults.
  - Invalid token → invalid page.
  - Already responded → success page summarising prior response.
  - Submit happy path → success page; toast "Response submitted".
  - Quote mode: only systemKey-marked fields are editable; everything else is read-only.

## Acceptance Criteria
- [ ] `/respond/:replyToken` renders without auth and without the app shell.
- [ ] Loading / invalid / already-responded / ready states all rendered correctly.
- [ ] Quote-mode editability honours systemKey restriction.
- [ ] Submit posts the FormState shape FE-8 produces.
- [ ] Feature flag toggles fixture vs live endpoints — no other code change required to switch.
- [ ] Page is responsive on mobile (suppliers will open the link on phones).

## Open Questions
- [ ] Public submit endpoint shape — defined by backend F3. Until then, the fixture mocks the call shape; the contract here is **the FormState payload from FE-8** plus the `replyToken` in the URL.
- [ ] Should the portal allow re-submission (overwriting a prior response)? **Recommend yes** with a confirmation dialog — easier for suppliers; backend F3 can decide whether it accepts the second submit.
- [ ] CSRF semantics — public token is treated as the credential; no additional cookie. Backend F3 may add rate limiting per token.

## Cross-references
- [`/docs/email-features/F3-rfp-email-integration.md`](../email-features/F3-rfp-email-integration.md).
- [`/docs/email-implementation.md`](../email-implementation.md) §15 (mention of `https://app/.../respond/{replyToken}`).
- Upstream: [FE-0](./FE-0-foundation.md), [FE-8](./FE-8-form-engine.md).
- Downstream (post-launch): a possible "supplier-side dashboard" feature — not in scope.
