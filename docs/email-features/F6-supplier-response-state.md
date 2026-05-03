# F6 — Supplier Response State

## Status
Not started   Owner: tbd   Effort: ~½ day

## Goal
Translate a matched `InboundEmail` (output of F5) into business state: stamp `RFPSupplier.respondedAt`, flip status to `responded`, optionally send a one-time confirmation back to the supplier, and expose admin endpoints to inspect & manually resolve unmatched replies.

## Dependencies
- **F5** must be merged: `processInboundReply` matches inbound to `(rfpId, supplierId)`.
- **F3** must be merged: provides the `send_response_confirmed` template/handler for auto-confirm.
- **F2** must be merged: `enqueueOutbound` for the auto-confirm.

## Scope

### In scope
- `markRfpSupplierResponded(rfpId, supplierId, inboundEmailId)` — single source of truth for "a supplier replied":
  - If `RFPSupplier.respondedAt` is null, set `respondedAt = now()`, `status = "responded"`.
  - Otherwise, leave timestamps alone (multiple replies are a thing).
  - If the auto-confirm flag is on AND no prior `EmailMessage` exists with idempotency key `rfp:{rfpId}:supplier:{supplierId}:confirmed`, enqueue `send_response_confirmed` (idempotency naturally collapses duplicates).
- Hook this into the inbound flow: `processInboundReply` (F5) calls `markRfpSupplierResponded` on match.
- Admin endpoints (auth-protected — admin role):
  - `GET /api/admin/inbound/unmatched?limit=50&cursor=...` — paginated list of unmatched replies.
  - `GET /api/admin/inbound/:id` — full detail of a single inbound (incl. raw payload).
  - `POST /api/admin/inbound/:id/manual-match` body: `{ rfpId, supplierId }` → updates `InboundEmail`, calls `markRfpSupplierResponded`.

### Out of scope (handled elsewhere)
- Quote extraction → **F8**.
- Frontend admin UI → handled in `apps/web` separately.
- Bulk-resolve operations → can be a follow-up.
- Auth/role middleware itself — assume an existing `requireAdmin` middleware exists; if not, gate by `req.auth.userId === N` for v1.

## Implementation Plan
1. Implement `apps/email-worker/src/handlers/markRfpSupplierResponded.ts` exposing the function.
2. Wire it from `processInboundReply` (F5): immediately after `InboundEmail` status flips to `matched`.
3. Add `apps/api/src/controllers/adminInboundController.ts` with `listUnmatched`, `getInbound`, `manualMatch` handlers.
4. Add `apps/api/src/routes/adminInboundRoutes.ts` mounting at `/api/admin/inbound`.
5. Mount router in `apps/api/src/app.ts` behind admin auth (or note that admin auth is a separate task).
6. Wire `manualMatch` to call `markRfpSupplierResponded`. Use a lightweight HTTP path: API → directly call a service function that updates `InboundEmail` + calls `markRfpSupplierResponded`. (Avoid round-tripping through the queue for admin actions; they're synchronous user actions.)
7. Decide auto-confirm default: **on** for v1.

## Files

### To create
- `apps/email-worker/src/handlers/markRfpSupplierResponded.ts`
- `apps/api/src/controllers/adminInboundController.ts`
- `apps/api/src/routes/adminInboundRoutes.ts`
- `apps/api/src/service/inboundEmailService.ts` (shared logic between worker and admin route)

### To modify
- `apps/email-worker/src/handlers/processInboundReply.ts` (F5) — call `markRfpSupplierResponded` after match.
- `apps/api/src/app.ts` — mount admin inbound router.

## DB / Schema Changes
None new. F6 only updates existing tables (`RFPSupplier`, `InboundEmail`). Optional consideration: add `RFPSupplier.responseCount` if you want to track total replies — defer unless needed.

State transitions F6 owns:
```
RFPSupplier.status: invited ──► responded
RFPSupplier.respondedAt: null ──► <first matched reply timestamp>

InboundEmail.status: matched (no change here; F5 set it). F6 reads it.
                     unmatched ──► matched   (only via admin manualMatch)
```

## Config / Env Vars
Optional new flag (consumed by `markRfpSupplierResponded`):
```bash
EMAIL_AUTOCONFIRM_REPLIES=true
```
If false, supplier replies still update state but no confirmation email is sent.

Add to F1's env-var block (and `.env.example`).

## Packages
None new.

## Contracts Exported

```ts
// apps/email-worker/src/handlers/markRfpSupplierResponded.ts
export interface MarkRespondedArgs {
  rfpId: number;
  supplierId: number;
  inboundEmailId: number;
}
export async function markRfpSupplierResponded(args: MarkRespondedArgs): Promise<void>;
```

```ts
// apps/api/src/service/inboundEmailService.ts
export async function listUnmatched(args: { limit: number; cursor?: number }): Promise<...>;
export async function getInbound(id: number): Promise<...>;
export async function manualMatch(args: { id: number; rfpId: number; supplierId: number }): Promise<...>;
```

HTTP endpoints:
- `GET /api/admin/inbound/unmatched`
- `GET /api/admin/inbound/:id`
- `POST /api/admin/inbound/:id/manual-match`

## Code Sketches

```ts
// apps/email-worker/src/handlers/markRfpSupplierResponded.ts
import { prisma } from "../config/db";
import { env } from "../config/env";
import { enqueueOutbound } from "../service/emailQueueService"; // or duplicate the helper in worker
import { logger } from "../config/logger";

export async function markRfpSupplierResponded(args: {
  rfpId: number;
  supplierId: number;
  inboundEmailId: number;
}) {
  const link = await prisma.rFPSupplier.findUnique({
    where: { rfpId_supplierId: { rfpId: args.rfpId, supplierId: args.supplierId } },
    include: { supplier: true, rfp: true },
  });
  if (!link) {
    logger.warn({ ...args }, "RFPSupplier not found in markResponded");
    return;
  }

  // Only stamp on first response.
  if (!link.respondedAt) {
    await prisma.rFPSupplier.update({
      where: { id: link.id },
      data: { respondedAt: new Date(), status: "responded" },
    });
  }

  if (env.EMAIL_AUTOCONFIRM_REPLIES) {
    await enqueueOutbound({
      type: "send_response_confirmed",
      idempotencyKey: `rfp:${args.rfpId}:supplier:${args.supplierId}:confirmed`,
      rfpId: args.rfpId,
      supplierId: args.supplierId,
      to: link.supplier.email,
      rfpSubject: link.rfp.subject,
    });
  }
}
```

```ts
// apps/api/src/service/inboundEmailService.ts (excerpt — manual match)
import { prisma } from "../config/database";
import { markRfpSupplierResponded } from "../service/markResponded"; // shared with worker

export async function manualMatch(args: {
  id: number;
  rfpId: number;
  supplierId: number;
  adminUserId: number;
}) {
  const link = await prisma.rFPSupplier.findUnique({
    where: { rfpId_supplierId: { rfpId: args.rfpId, supplierId: args.supplierId } },
  });
  if (!link) throw new Error("No RFPSupplier link for given (rfpId, supplierId)");

  await prisma.inboundEmail.update({
    where: { id: args.id },
    data: {
      status: "matched",
      rfpId: args.rfpId,
      supplierId: args.supplierId,
      matchedBy: "manual" as any, // extend matchedBy enum to include this
      processedAt: new Date(),
    },
  });

  await markRfpSupplierResponded({
    rfpId: args.rfpId,
    supplierId: args.supplierId,
    inboundEmailId: args.id,
  });
}
```

```ts
// apps/api/src/controllers/adminInboundController.ts
import type { Request, Response } from "express";
import * as service from "../service/inboundEmailService";

export async function listUnmatched(req: Request, res: Response) {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
  const data = await service.listUnmatched({ limit, cursor });
  res.json({ success: true, data });
}

export async function manualMatch(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { rfpId, supplierId } = req.body as { rfpId: number; supplierId: number };
  await service.manualMatch({ id, rfpId, supplierId, adminUserId: req.auth!.userId });
  res.json({ success: true });
}
```

## Testing
- **Unit:**
  - `markRfpSupplierResponded` first call → `respondedAt` set, status `responded`, confirmation enqueued (one `EmailMessage` row with idempotency key collision check).
  - `markRfpSupplierResponded` second call (same args) → `respondedAt` unchanged, no second confirmation (idempotency key catches it).
  - `EMAIL_AUTOCONFIRM_REPLIES=false` → no confirmation enqueued, but state still updated.
- **Integration:**
  - Submit RFP → supplier reply → `RFPSupplier.respondedAt` set; `EmailMessage` of type `send_response_confirmed` exists.
  - Second reply from same supplier → no change in `respondedAt`; no second confirmation.
  - Admin `GET /api/admin/inbound/unmatched` returns rows with `status = "unmatched"`.
  - Admin `POST /api/admin/inbound/:id/manual-match` → row flips to `matched`, `respondedAt` populated.
- **Auth:**
  - Admin endpoints reject non-admin users with 403.

## Acceptance Criteria
- [ ] First supplier reply → `RFPSupplier.respondedAt` populated, `status = "responded"`, confirmation email queued.
- [ ] Second reply from same supplier → no second `respondedAt` write, no second confirmation.
- [ ] `EMAIL_AUTOCONFIRM_REPLIES=false` → state updates happen, no confirmation sent.
- [ ] Admin `unmatched` listing returns paginated unmatched inbound rows, newest first.
- [ ] Admin `manual-match` flips status, populates IDs, triggers `markRfpSupplierResponded` (and confirmation).
- [ ] `manualMatch` rejects payloads where `(rfpId, supplierId)` has no `RFPSupplier` row.

## Open Questions
- [ ] **Where does `markRfpSupplierResponded` actually live?** Option A: only in `apps/email-worker`, the API route hits a shared `packages/email-core` package. Option B: duplicate in API. **Recommend extract to a shared `packages/` package once we have a second consumer (admin manual-match)** — happens in F6, so do it here. Add `packages/email-core` for shared business logic.
- [ ] Add a `RFPSupplier.responseCount` field to count multiple replies? **Defer** — can derive from `count(InboundEmail where rfpId/supplierId)` if ever needed.
- [ ] Audit log on manual-match (who matched what, when)? Consider — for v1, rely on Postgres timestamp + a log line. Later add an `AdminAction` table.
- [ ] Should `manualMatch` send a confirmation even though the original auto-confirm window passed? **Recommend yes** — same idempotency key applies; if confirmation was never sent (auto-confirm was off when reply arrived), this is the chance.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §11 Phase 4 (admin endpoints), §15 (Open Decisions — auto-reply, multiple replies).
- Upstream: [F2](./F2-outbound-email-system.md), [F3](./F3-rfp-email-integration.md), [F5](./F5-email-mapping.md).
- Downstream: [F8](./F8-ai-processing.md) listens to "matched + responded" events; the hook lives at the end of `markRfpSupplierResponded`.
