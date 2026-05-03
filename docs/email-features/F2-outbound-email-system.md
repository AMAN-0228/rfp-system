# F2 — Outbound Email System

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Build a provider-agnostic outbound pipeline that any feature can use to send transactional email. Pulls jobs off the BullMQ outbound queue, dispatches by `type`, calls Resend, updates the `EmailMessage` row through its status state machine. **No business logic** — RFP-specific templates and OTP wiring live in F3.

## Dependencies
- **F1** must be merged: BullMQ queues, `EmailMessage` model, Resend client factory, `OutboundJob` zod schema, worker process scaffolding.

## Scope

### In scope
- `resendProvider.send()` wrapping the Resend SDK with proper 4xx vs 5xx handling.
- Outbound BullMQ worker consuming `email-outbound` queue.
- A type-routed dispatcher that calls a registered handler per `OutboundJob.type`.
- `enqueueOutbound()` helper in API — creates `EmailMessage` row first, then enqueues with `jobId = idempotencyKey`.
- Idempotency check in worker: read `EmailMessage` by idempotency key; if `status ∈ {sent, delivered}`, no-op and log.
- Generic template renderer interface (handlers return `{ subject, html, text }`).
- A debug `test_send` handler so the pipeline can be smoke-tested before F3 lands.

### Out of scope (handled elsewhere)
- RFP invitation, OTP, confirmation templates → **F3**.
- `Reply-To` plus-addressing — F2 supports a `replyTo` arg but F3 fills it in.
- Resend delivery webhook → **F7**.
- BullMQ retry tuning, dedup hardening → **F7**.
- Inbound matching → **F5**.

## Implementation Plan
1. Define a handler registry interface: `registerOutboundHandler(type, handler)` where the handler renders a template and returns the email payload.
2. Implement `resendProvider.send({ to, from, subject, html, text, replyTo, headers })` returning `{ providerMessageId }` on success or throwing typed errors (`ResendPermanentError` for 4xx, `ResendTransientError` for 5xx/network).
3. Implement `outboundWorker` (replace the F1 skeleton):
   - Validate `job.data` against `OutboundJob` zod schema.
   - Look up `EmailMessage` by idempotency key.
   - Idempotency guard.
   - Dispatch by `type` to the handler.
   - Call `resendProvider.send()`.
   - Update `EmailMessage`: `status = "sent"`, `sentAt = now()`, `providerMessageId = ...`.
   - On `ResendPermanentError`: `status = "failed"`, set `errorMessage`, return (don't retry).
   - On `ResendTransientError`: throw → BullMQ retries.
   - Increment `attemptCount` on every attempt.
4. Implement `enqueueOutbound()`:
   - Validate payload with zod.
   - `EmailMessage.create({ status: "queued", idempotencyKey, type, toEmail, ... })`.
   - On unique-constraint hit (idempotency key collision), look up the existing row and return it (don't enqueue again).
   - `outboundQueue.add(type, payload, { jobId: idempotencyKey })`.
5. Register a `test_send` handler in `email-worker` so the pipeline can be tested end-to-end without F3.
6. Document handler-registration pattern in this doc so F3 knows how to plug in.

## Files

### To create
- `apps/email-worker/src/providers/resendProvider.ts`
- `apps/email-worker/src/providers/errors.ts` (typed error classes)
- `apps/email-worker/src/handlers/registry.ts` (handler registry)
- `apps/email-worker/src/handlers/testSend.ts` (debug handler)
- `apps/api/src/service/emailQueueService.ts` (`enqueueOutbound` helper)

### To modify
- `apps/email-worker/src/workers/outboundWorker.ts` (replace F1 skeleton with full impl).
- `apps/email-worker/src/index.ts` (register `testSend` handler at boot).

## DB / Schema Changes
None — F1 already created `EmailMessage`. F2 only writes/updates rows.

State transitions F2 owns:
```
queued ──► sent     (success)
queued ──► failed   (4xx from provider)
queued ──► queued   (5xx → retry, attemptCount++)
```

`delivered`, `bounced`, `complained` are F7's responsibility (delivery webhook).

## Config / Env Vars
None new. Consumes from F1: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `EMAIL_ENABLED`, `EMAIL_OUTBOUND_QUEUE`.

If `EMAIL_ENABLED=false`, `enqueueOutbound()` should still create the `EmailMessage` row with `status = "skipped"` and **not** enqueue. Useful for local dev.

## Packages
None new beyond F1.

## Contracts Exported

```ts
// apps/email-worker/src/handlers/registry.ts
import type { OutboundJob } from "@apps/email-contracts";

export interface OutboundEmailPayload {
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export type OutboundHandler<T extends OutboundJob = OutboundJob> = (
  job: T
) => Promise<OutboundEmailPayload>;

const handlers = new Map<string, OutboundHandler>();

export function registerOutboundHandler<T extends OutboundJob["type"]>(
  type: T,
  handler: OutboundHandler<Extract<OutboundJob, { type: T }>>
): void {
  handlers.set(type, handler as OutboundHandler);
}

export function getOutboundHandler(type: string): OutboundHandler | undefined {
  return handlers.get(type);
}
```

```ts
// apps/api/src/service/emailQueueService.ts
import { OutboundJob } from "@apps/email-contracts";
import { outboundQueue } from "../config/queue";
import { prisma } from "../config/database";
import { env } from "../config/env";

export async function enqueueOutbound(payload: OutboundJob) {
  const parsed = OutboundJob.parse(payload);

  const emailMessage = await prisma.emailMessage.upsert({
    where: { idempotencyKey: parsed.idempotencyKey },
    create: {
      idempotencyKey: parsed.idempotencyKey,
      type: parsed.type,
      toEmail: parsed.to,
      fromEmail: env.RESEND_FROM_EMAIL,
      subject: "(pending render)",
      status: env.EMAIL_ENABLED ? "queued" : "skipped",
      rfpId: "rfpId" in parsed ? parsed.rfpId : null,
      supplierId: "supplierId" in parsed ? parsed.supplierId : null,
      userId: "userId" in parsed ? parsed.userId : null,
    },
    update: {}, // idempotent: existing row left untouched
  });

  if (env.EMAIL_ENABLED && emailMessage.status === "queued") {
    await outboundQueue.add(parsed.type, parsed, { jobId: parsed.idempotencyKey });
  }

  return emailMessage;
}
```

## Code Sketches

```ts
// apps/email-worker/src/providers/errors.ts
export class ResendPermanentError extends Error {
  constructor(message: string, public statusCode: number) { super(message); }
}
export class ResendTransientError extends Error {
  constructor(message: string, public statusCode?: number) { super(message); }
}
```

```ts
// apps/email-worker/src/providers/resendProvider.ts
import { getResendClient } from "./clients";
import { ResendPermanentError, ResendTransientError } from "./errors";
import { env } from "../config/env";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function send(args: SendArgs): Promise<{ providerMessageId: string }> {
  const client = getResendClient();
  const result = await client.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: args.replyTo,
    headers: args.headers,
  });

  if (result.error) {
    const code = (result.error as any).statusCode ?? 500;
    if (code >= 400 && code < 500) {
      throw new ResendPermanentError(result.error.message, code);
    }
    throw new ResendTransientError(result.error.message, code);
  }

  if (!result.data?.id) {
    throw new ResendTransientError("Resend returned no message id");
  }
  return { providerMessageId: result.data.id };
}
```

```ts
// apps/email-worker/src/workers/outboundWorker.ts
import { Worker } from "bullmq";
import { OutboundJob } from "@apps/email-contracts";
import { redisConnection } from "../config/redis";
import { env } from "../config/env";
import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { getOutboundHandler } from "../handlers/registry";
import { send } from "../providers/resendProvider";
import { ResendPermanentError } from "../providers/errors";

export const outboundWorker = new Worker(
  env.EMAIL_OUTBOUND_QUEUE,
  async (job) => {
    const data = OutboundJob.parse(job.data);

    const row = await prisma.emailMessage.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (!row) throw new Error(`EmailMessage not found for ${data.idempotencyKey}`);
    if (row.status === "sent" || row.status === "delivered") {
      logger.info({ id: row.id }, "idempotent skip");
      return;
    }

    const handler = getOutboundHandler(data.type);
    if (!handler) throw new Error(`No handler for type ${data.type}`);
    const payload = await handler(data as any);

    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { subject: payload.subject, attemptCount: { increment: 1 } },
    });

    try {
      const { providerMessageId } = await send({
        to: data.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
        headers: payload.headers,
      });

      await prisma.emailMessage.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), providerMessageId },
      });
    } catch (err) {
      if (err instanceof ResendPermanentError) {
        await prisma.emailMessage.update({
          where: { id: row.id },
          data: { status: "failed", failedAt: new Date(), errorMessage: err.message },
        });
        return; // do not throw — no retry
      }
      throw err; // transient → BullMQ retry
    }
  },
  { connection: redisConnection, concurrency: 5 }
);
```

```ts
// apps/email-worker/src/handlers/testSend.ts
import { registerOutboundHandler } from "./registry";

registerOutboundHandler("test_send", async (job) => ({
  subject: job.subject,
  html: `<p>${job.body}</p>`,
  text: job.body,
}));
```

## Testing
- **Unit:**
  - Zod parses every variant of `OutboundJob`; invalid payloads throw.
  - Idempotency: enqueueing the same key twice → one `EmailMessage` row, one queue job.
  - Worker dispatches to the registered handler matching `job.type`.
- **Integration (with real Resend test mode):**
  - `enqueueOutbound({ type: "test_send", ... })` → email arrives at a verified address.
  - `EmailMessage` row transitions `queued → sent`.
- **Failure paths:**
  - Mock provider returning 422 → `status = "failed"`, no retry, `errorMessage` populated.
  - Mock provider returning 503 → BullMQ retries (visible via `attemptCount`).
- **EMAIL_ENABLED=false:** row created with `status = "skipped"`, no queue entry.

## Acceptance Criteria
- [ ] `enqueueOutbound({ type: "test_send", ... })` from API creates an `EmailMessage` row.
- [ ] Worker picks up the job, calls Resend test mode, email is delivered.
- [ ] `EmailMessage.status` ends as `"sent"` with `providerMessageId` populated.
- [ ] Re-enqueueing same idempotency key — no duplicate email, log line "idempotent skip".
- [ ] Mock 4xx — row ends `failed`, no retry.
- [ ] Mock 5xx — row stays `queued`, `attemptCount` increments per retry.
- [ ] `EMAIL_ENABLED=false` — row created with `status = "skipped"`, no provider call.
- [ ] Worker concurrency tested with 10 simultaneous enqueues — all processed correctly.

## Open Questions
- [ ] Should the handler registry be auto-discovered (file glob) or explicitly registered at boot? **Recommend explicit register-at-boot** for predictability.
- [ ] Use HTML+text or HTML-only? **Recommend both** for deliverability and accessibility.
- [ ] React Email vs plain template strings? Plain strings for v1 — react-email had a build cost we removed earlier. Reconsider in F3 if templates get complex.
- [ ] How are `EmailMessage.subject` and `fromEmail` populated at enqueue time vs at render time? Current sketch sets a placeholder subject at enqueue and overwrites it at render — confirm this is acceptable.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §10 (Job Payloads), §12 (Idempotency), §14 (Testing).
- Upstream: [F1](./F1-email-infrastructure.md).
- Downstream: [F3](./F3-rfp-email-integration.md) plugs handlers via `registerOutboundHandler`.
- F7 will adjust BullMQ retry config and add `delivered/bounced/complained` transitions; F2 leaves them untouched.
