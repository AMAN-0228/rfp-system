# Frontend Features Index

Living index of the parallelizable frontend slice breakdown. Each slice has a self-contained doc with planning, implementation, contracts, code sketches, tests, and acceptance criteria. Update only the **Status** column here when a slice ships; all detail edits happen in the per-slice doc.

The slicing follows the same discipline as the backend [email features](../email-features/README.md): one foundation slice (FE-0) lays down contracts every downstream slice imports, slices are 1–3 dev-days each, and backend-gated work is reserved with a deferred-stub (mirrors F8) rather than dropped.

Architecture reference: see the prior session's frontend architecture decision (Vite + React + TS + TanStack Router + TanStack Query + Zustand + RHF + Zod + shadcn/ui + ky + openapi-typescript). The first card (FE-0) implements that decision; later cards consume it.

## Status board

| # | Slice | Status | Owner | Effort |
|---|---|---|---|---|
| FE-0 | [Foundation](./FE-0-foundation.md) | Not started | tbd | 2 d |
| FE-1 | [Auth — Register + Verify OTP](./FE-1-auth-register.md) | Not started | tbd | 1.5 d |
| FE-2 | [Auth — Login + Refresh Interceptor + Logout](./FE-2-auth-login.md) | Not started | tbd | 1 d |
| FE-3 | [Auth — Forgot Password + Reset](./FE-3-auth-password-reset.md) | Not started | tbd | 1 d |
| FE-4 | [App Shell + Dashboard + Guards](./FE-4-app-shell.md) | Not started | tbd | 1.5 d |
| FE-5 | [Supplier List](./FE-5-supplier-list.md) | Not started | tbd | 1.5 d |
| FE-6 | [Supplier CRUD](./FE-6-supplier-crud.md) | Not started | tbd | 1.5 d |
| FE-7 | [Template — Read-only View](./FE-7-template-view.md) | Not started | tbd | 1 d |
| FE-8 | [Dynamic Form Engine](./FE-8-form-engine.md) | Not started | tbd | 3 d |
| FE-9 | [RFP List](./FE-9-rfp-list.md) | Not started | tbd | 1 d |
| FE-10 | [RFP Create/Draft + Edit](./FE-10-rfp-create-edit.md) | Not started | tbd | 2 d |
| FE-11 | [RFP Submit + Supplier Picker](./FE-11-rfp-submit.md) | Not started | tbd | 1.5 d |
| FE-12 | [RFP Detail + Delivery/Response Status](./FE-12-rfp-detail-status.md) | Deferred-stub (BE F2/F3/F6) | tbd | 1.5 d |
| FE-13 | [Supplier-Facing Portal](./FE-13-supplier-portal.md) | Deferred-stub (BE F3) | tbd | 2 d |
| FE-14 | [Admin Inbound](./FE-14-admin-inbound.md) | Deferred-stub (BE F6) | tbd | 1.5 d |
| FE-15 | [Profile / Settings](./FE-15-profile-settings.md) | Deferred-stub (BE userProfile) | tbd | ½ d |

## Dependency graph

```
                         FE-0 (Foundation)
                           │
           ┌───────────────┼───────────────────────────────────┐
           ▼               ▼                                   ▼
         FE-1            FE-2 (login + refresh) ───────► FE-13 (public portal — BE F3 gated)
         (register)        │
           │               ▼
           ▼             FE-4 (shell + guards)
         FE-3              │
       (forgot)            ├─► FE-5 ─► FE-6                    (supplier CRUD)
                           ├─► FE-7 ─► FE-8 ─► FE-10 ─► FE-11 ─► FE-12   (rfp critical path; FE-12 BE F2/F3/F6 gated)
                           ├─► FE-9                            (rfp browse — independent)
                           ├─► FE-14 (admin inbound — BE F6 gated)
                           └─► FE-15 (profile — BE stub gated)
```

**Critical path (RFP authoring end-to-end):** FE-0 → FE-2 → FE-4 → FE-7 → FE-8 → FE-10 → FE-11.

**Parallel tracks once FE-0 + FE-2 + FE-4 land:**
- Track A (auth polish): FE-1, FE-3
- Track B (suppliers): FE-5 → FE-6
- Track C (RFP critical path): FE-7 → FE-8 → FE-10 → FE-11 → FE-12 (gated)
- Track D (RFP browse): FE-9
- Track E (public portal): FE-13 — needs only FE-0 + FE-8 contracts; backend F3 gated
- Track F (admin/inbound): FE-14 — backend F6 gated
- Track G (profile): FE-15 — backend stub gated

**Key rule:** FE-0 must merge **all shared contracts upfront** — `endpoints.ts`, the typed `api` client wrapper, the `appId`-aware `qk` query-key factory, the `auth` Zustand store shape, the design-system primitives, and the `openapi-typescript`–generated `types.gen.ts`. No downstream slice may redeclare these. Identical to F1's "merge contracts upfront" rule.

## Backend gating

| Frontend slice | Blocks on backend |
|---|---|
| FE-12 RFP detail (delivery / response status) | **F2** (outbound status), **F3** (RFP→email integration), **F6** (`respondedAt`) |
| FE-13 Supplier portal | **F3** (`replyToken` populated, public RFP-by-token endpoint) |
| FE-14 Admin inbound | **F6** (admin endpoints) |
| FE-15 Profile | `userProfile` controller (currently TODO per CLAUDE.md known issues) |

Every other slice runs on already-shipped auth / supplier / RFP endpoints. Note: `/rfp/` (not `/api/rfp/`) is a known backend bug — FE-0's `endpoints.ts` is the single mitigation point for the eventual fix.

## Cross-slice integration / end-to-end verification

After FE-0 through FE-11 land, the following scenario must pass on `develop`:

1. Register a new user via `/register`; verify via OTP (FE-1).
2. Log in (FE-2); land on the dashboard shell (FE-4).
3. Create two suppliers in `/suppliers` (FE-5 + FE-6).
4. Open an admin-seeded template in `/templates/:id` (FE-7) — confirm sections + fields render read-only.
5. From `/rfps/new` (FE-10), instantiate the template, fill FORM section + add 3 TABLE rows (FE-8 engine), click **Save Draft** → POST with `method: 'save'` succeeds; row appears in `/rfps` (FE-9) with status `drafted`.
6. Reopen the draft via `/rfps/:id/edit` (FE-10); edit a row, delete a row (`action: 'delete'`), submit via the supplier picker (FE-11) → POST with `method: 'submit'`; backend transitions RFP to `submitted`.
7. Refresh `/rfps` (FE-9); RFP shows `submitted`.

Once backend F2/F3/F6 land, FE-12's status pills (`sending → sent / partial / failed`) and the polled `respondedAt` timestamp light up automatically — no further frontend work required if the contract held.

FE-13/FE-14/FE-15 each unlock their own verification once their respective backend dependency merges; each card describes its scenario.

## Working notes

- Each slice doc is the **source of truth** for that slice's status. Update its `## Status` line and `## Acceptance Criteria` checklist as work progresses.
- Reuse contracts from FE-0; do not redeclare endpoints, query keys, or API client logic in feature slices.
- Backend-gated slices follow the [F8 deferred-stub pattern](../email-features/F8-ai-processing.md) — ship the route + the no-op shell + the typed contract; flip the feature flag when the backend dependency lands.
- All Query keys nest under `appId` from day one (multi-tenancy plan-ahead). Even though backend doesn't enforce `appId` filtering yet, every cache entry is partitioned correctly when it does.
- If FE-8 (form engine) spike reveals more risk than budgeted, split into FE-8a (FORM) + FE-8b (TABLE engine). FE-10 only blocks on FE-8b.
