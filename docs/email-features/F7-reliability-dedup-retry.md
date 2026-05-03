# F7 — Reliability (Dedup / Retry / Webhook Hardening)

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Cross-cutting hardening so the email pipeline survives retries, duplicates, and out-of-order events. Three concrete deliverables: (1) Mailgun inbound webhook becomes truly idempotent, (2) Resend delivery webhooks are accepted with replay protection and a forward-only status state machine, (3) BullMQ retry config is tuned with proper backoff. F7 patches handlers landed by F2 and F4 — it is **not blocked** on F2/F4 finishing; design upfront, integrate as they merge.

## Dependencies
- **F1** — Redis client, `EmailMessage`, `InboundEmail`.
- Touches **F2** outbound worker (re-check guard, retry config).
- Touches **F4** inbound webhook (token replay, Message-Id dedup, BullMQ jobId).
- Adds a new endpoint that does **not** depend on F2/F4 but updates rows F2/F4 own.

## Scope

### In scope
- **Mailgun inbound dedup** — three layers:
  1. Redis SETNX on `mailgun:webhook:token:{token}` (10-min TTL) — catches retries of the exact same HTTP request.
  2. 5-minute timestamp replay window — reject signatures older than 300s.
  3. `InboundEmail.providerMessageId` unique-constraint catch (already in F4) — final defense.
- **BullMQ-level dedup** for `process_inbound`: `jobId = inbound:{id}` (already in F4; F7 documents/asserts).
- **Resend delivery webhook** — new endpoint `POST /webhooks/resend`:
  - Verify Svix-style signature (Resend uses Svix).
  - Redis SETNX on `resend:event:{eventId}` (7-day TTL).
  - Update `EmailMessage.status` with **forward-only state machine** (out-of-order events ignored).
  - Conditional update via Prisma `updateMany` with `where: { status: { in: precedingStates } }`.
- **BullMQ retry config** preset (shared constant):
  - `attempts: 5`
  - `backoff: { type: "exponential", delay: 60_000 }` (1m, 2m, 4m, 8m, 16m)
  - `removeOnComplete: { age: 86400, count: 1000 }`
  - `removeOnFail: { age: 7 * 86400 }`
- **Worker idempotency guard** for outbound: re-check `EmailMessage.status` at the top of every job (in case BullMQ retried after a successful provider call).
- **Status state machine** helpers exported:
  - `precedingStatesFor(eventType)` → array of valid prior statuses.
  - `nextStatusFor(eventType)` → target status.
  - Allowed transitions only:
    ```
    queued → sent → delivered
                  ↘ bounced (terminal)
                  ↘ complained (terminal)
           ↘ failed (terminal)
    ```

### Out of scope (handled elsewhere)
- Outbound rate-limiting (provider handles).
- Dead-letter UI — defer.
- Bulk replay tooling — defer.
- Inbound matching/state changes → F5/F6.

## Implementation Plan
1. Add `apps/api/src/utils/dedup.ts` with `dedupSetNx(key, ttlSec): Promise<boolean>` helper using existing Redis client.
2. Patch `apps/api/src/utils/webhookSignatures.ts` (added in F4):
   - Add `verifyMailgunSignatureWithReplay({ timestamp, token, signature })` that ALSO checks `(now - timestamp) <= 300`.
   - Keep raw `verifyMailgunSignature` for tests.
3. Patch `apps/api/src/controllers/webhookController.ts` `mailgunInbound` handler: use the new replay-safe verifier; add Redis SETNX on `token`.
4. Add Svix signature verifier `verifyResendSignature(headers, rawBody)` using `svix` package. Resend signs payloads in this format; Svix lib does the heavy lifting.
5. Implement `POST /webhooks/resend` endpoint:
   - Mount with raw-body parser (signature requires raw bytes).
   - Verify Svix signature.
   - Dedup by `event.id` using Redis SETNX.
   - Map event type → state machine transition.
   - `prisma.emailMessage.updateMany({ where: { providerMessageId, status: { in: precedingStates } }, data: { status: nextStatus, ...timestamps } })`.
6. Add `apps/email-worker/src/config/bullConfig.ts` exporting the shared retry preset; have F2's outbound worker import it. Same for inbound worker.
7. Patch outbound worker (from F2) to import `bullConfig` and apply on `Worker` and on every `add()` call site (or default at `Queue` level).
8. Add tests: replay duplicate, out-of-order, expired-timestamp.

## Files

### To create
- `apps/api/src/utils/dedup.ts`
- `apps/api/src/utils/resendWebhook.ts` (Svix verifier, state machine helpers)
- `apps/api/src/controllers/resendWebhookController.ts`
- `apps/api/src/routes/resendWebhookRoutes.ts`
- `apps/email-worker/src/config/bullConfig.ts`
- `apps/api/src/utils/emailStatusMachine.ts` (shared between API and worker — consider moving to `packages/email-core`)

### To modify
- `apps/api/src/utils/webhookSignatures.ts` (extend with replay verifier).
- `apps/api/src/controllers/webhookController.ts` (Mailgun handler — add token SETNX + replay window).
- `apps/api/src/routes/webhookRoutes.ts` (mount Resend webhook).
- `apps/email-worker/src/workers/outboundWorker.ts` (import shared bullConfig; add re-check guard if F2 left it minimal).
- `apps/api/src/config/queue.ts` (apply default `defaultJobOptions` from `bullConfig`).

## DB / Schema Changes
None — `EmailMessage.status` field already exists with all needed states. F7 only owns transitions, not schema.

## Config / Env Vars
Adds:
```bash
RESEND_WEBHOOK_SECRET=          # Svix signing secret from Resend dashboard
```

Append to F1's env-var block. `MAILGUN_WEBHOOK_SIGNING_KEY` already exists.

## Packages
- `svix` (Svix SDK for verifying Resend webhooks).
- Add to API: `pnpm --filter @apps/api add svix`.

## Contracts Exported

```ts
// apps/api/src/utils/dedup.ts
export async function dedupSetNx(key: string, ttlSec: number): Promise<boolean>;
// Returns true if the key was newly set (i.e. NOT a duplicate).
// Returns false if the key already exists.
```

```ts
// apps/api/src/utils/emailStatusMachine.ts
export type EmailStatus =
  | "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "skipped";
export type ResendEventType =
  | "email.sent" | "email.delivered" | "email.bounced"
  | "email.complained" | "email.delivery_delayed" | "email.opened" | "email.clicked";

export function precedingStatesFor(event: ResendEventType): EmailStatus[];
export function nextStatusFor(event: ResendEventType): EmailStatus | null;
// nextStatusFor returns null for events that don't change status (opened/clicked/delayed).
```

```ts
// apps/email-worker/src/config/bullConfig.ts
import type { JobsOptions } from "bullmq";
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 7 * 86_400 },
};
```

HTTP endpoints:
- `POST /webhooks/resend`

## Code Sketches

```ts
// apps/api/src/utils/dedup.ts
import { redisClient } from "../config/redis";

export async function dedupSetNx(key: string, ttlSec: number): Promise<boolean> {
  const result = await redisClient.set(key, "1", "EX", ttlSec, "NX");
  return result === "OK";
}
```

```ts
// apps/api/src/utils/emailStatusMachine.ts
import type { EmailStatus, ResendEventType } from "./types";

const TRANSITIONS: Record<ResendEventType, { from: EmailStatus[]; to: EmailStatus | null }> = {
  "email.sent":           { from: ["queued"],                     to: "sent" },
  "email.delivered":      { from: ["queued", "sent"],             to: "delivered" },
  "email.bounced":        { from: ["queued", "sent"],             to: "bounced" },
  "email.complained":     { from: ["queued", "sent", "delivered"], to: "complained" },
  "email.delivery_delayed": { from: [],                            to: null },
  "email.opened":         { from: [],                              to: null },
  "email.clicked":        { from: [],                              to: null },
};

export function precedingStatesFor(event: ResendEventType) { return TRANSITIONS[event].from; }
export function nextStatusFor(event: ResendEventType) { return TRANSITIONS[event].to; }
```

```ts
// apps/api/src/controllers/resendWebhookController.ts
import type { Request, Response } from "express";
import { Webhook } from "svix";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { dedupSetNx } from "../utils/dedup";
import { precedingStatesFor, nextStatusFor } from "../utils/emailStatusMachine";

export async function resendWebhook(req: Request & { rawBody?: string }, res: Response) {
  const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
  let event: any;
  try {
    event = wh.verify(req.rawBody!, {
      "svix-id": req.headers["svix-id"] as string,
      "svix-timestamp": req.headers["svix-timestamp"] as string,
      "svix-signature": req.headers["svix-signature"] as string,
    });
  } catch {
    return res.status(401).end();
  }

  // Dedup by event id (Resend events have stable ids).
  const isNew = await dedupSetNx(`resend:event:${event.id}`, 7 * 86_400);
  if (!isNew) return res.status(200).end();

  const eventType = event.type as any;
  const target = nextStatusFor(eventType);
  if (!target) return res.status(200).end(); // no-op events (opened/clicked)

  const fromStates = precedingStatesFor(eventType);
  const timestampField =
    eventType === "email.sent"      ? "sentAt"
    : eventType === "email.delivered" ? "deliveredAt"
    : eventType === "email.bounced" || eventType === "email.complained" ? "failedAt"
    : null;

  await prisma.emailMessage.updateMany({
    where: {
      providerMessageId: event.data.email_id,
      status: { in: fromStates },
    },
    data: {
      status: target,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
      ...(eventType === "email.bounced" || eventType === "email.complained"
        ? { errorMessage: event.data.reason ?? eventType }
        : {}),
    },
  });

  return res.status(200).end();
}
```

```ts
// apps/api/src/routes/webhookRoutes.ts (extend F4's file)
import express from "express";
import { resendWebhook } from "../controllers/resendWebhookController";

router.post(
  "/resend",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, _res, next) => {
    (req as any).rawBody = (req.body as Buffer).toString("utf8");
    req.body = JSON.parse((req as any).rawBody);
    next();
  },
  resendWebhook
);
```

```ts
// apps/api/src/controllers/webhookController.ts (patches over F4)
import { dedupSetNx } from "../utils/dedup";

// inside mailgunInbound, BEFORE the InboundEmail.create:

// 1. Replay-window check (5 min)
const ageSec = Math.floor(Date.now() / 1000) - Number(body.timestamp);
if (ageSec > 300) {
  return res.status(401).end();
}

// 2. Token-level dedup of THIS HTTP delivery attempt.
const isNew = await dedupSetNx(`mailgun:webhook:token:${body.token}`, 600);
if (!isNew) {
  // We already processed (or are processing) this exact request.
  return res.status(200).json({ ok: true, dedup: true });
}

// 3. Then continue with the existing F4 logic — Message-Id unique constraint
//    handles the case where Mailgun re-delivers the email itself.
```

```ts
// apps/email-worker/src/workers/outboundWorker.ts (patches over F2)
// At the top of the worker function, after fetching the EmailMessage row:
if (row.status === "sent" || row.status === "delivered") {
  logger.info({ id: row.id }, "idempotent skip (worker re-check)");
  return;
}

// Apply DEFAULT_JOB_OPTIONS at the queue level so all .add() calls inherit:
// In apps/api/src/config/queue.ts:
import { DEFAULT_JOB_OPTIONS } from "@apps/email-worker/config/bullConfig"; // or duplicate
export const outboundQueue = new Queue(env.EMAIL_OUTBOUND_QUEUE, {
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
```

## Testing
- **Unit:**
  - `dedupSetNx(key, ttl)` first call → true; second call → false; after `ttl` → true again.
  - `precedingStatesFor`/`nextStatusFor` for every event type (incl. no-ops).
  - State-machine: out-of-order `delivered` before `sent` → final `delivered`, `sentAt` populated by the later `sent` event? **No** — `email.sent` has `from = ["queued"]` so it can't move from `delivered` back. So if `delivered` arrives first, `sentAt` is null. Document this behavior or add a fallback: when transitioning to `delivered`, set `sentAt` to `coalesce(sentAt, now())`.
- **Integration:**
  - Replay the same Mailgun webhook payload twice → 200, 200; one `InboundEmail` row.
  - Send Mailgun webhook with `timestamp = now - 6min` → 401.
  - Replay the same Resend `delivered` event twice → status set on first call, no-op on second.
  - Send Resend events out of order (`delivered` then `sent`) → final status `delivered`.
  - Send Resend `opened` event → 200, no DB change.
- **Worker idempotency:**
  - Force a BullMQ retry on a job whose `EmailMessage.status` is already `sent` → no Resend API call, log "idempotent skip".

## Acceptance Criteria
- [ ] Replay any captured Mailgun webhook twice → both 200, one DB row.
- [ ] Mailgun webhook with timestamp >5min old → 401.
- [ ] Replay any Resend event twice → first updates row, second is a no-op.
- [ ] Out-of-order `delivered` before `sent` → final status `delivered` (sentAt may remain null — documented).
- [ ] Resend events with no state change (`opened`, `clicked`) → 200, no row update.
- [ ] BullMQ-retried outbound job whose row is already `sent` → log "idempotent skip", no provider call.
- [ ] All `removeOnComplete` / `removeOnFail` TTLs are configured (verify via BullMQ UI: completed jobs disappear after 1 day).

## Open Questions
- [ ] `email.delivery_delayed` — counts as a status update or just a log line? **Recommend log only** in v1.
- [ ] Should we expose `EmailMessage.lastEventAt` to record the most recent event regardless of status? Useful for ops. Defer unless we need it.
- [ ] When `delivered` arrives before `sent`, do we backfill `sentAt`? **Recommend yes** — add `sentAt: coalesce(sentAt, now())` to the `delivered` transition.
- [ ] Use Svix's optional retries-on-our-side vs trust their retry budget? **Recommend trust their retries** — we just need to be idempotent.
- [ ] Move `dedupSetNx` and the state machine to a shared `packages/email-core` so worker can use them too? **Recommend yes** — F6 also has a candidate (`markRfpSupplierResponded`). Create `packages/email-core` once during F6 or F7 and migrate.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §13a (Duplicate Webhook Handling), §13b (Retry Strategy).
- Touches: [F2](./F2-outbound-email-system.md), [F4](./F4-inbound-email-capture.md).
- Independent of: F3, F5, F6 — but their stability improves significantly once F7 lands.
