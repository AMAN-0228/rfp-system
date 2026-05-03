# F1 — Email Infrastructure

## Status
Complete   Owner: tbd   Effort: ~½ day

## Goal
Land the foundational plumbing every other email feature depends on: a new email-worker process, a shared contracts package, BullMQ queues on the existing Redis, all DB migrations, env vars, and provider client factories. Once F1 merges, F2/F4/F7 can be picked up in parallel against stable contracts.

## Dependencies
None. F1 is the foundation. F2–F8 all import from F1.

## Scope

### In scope
- New workspace package: `apps/email-worker` (TypeScript, tsx in dev, separate process from API).
- New workspace package: `packages/email-contracts` exporting zod schemas + TS types for all queue jobs.
- BullMQ queue instances in `apps/api/src/config/queue.ts` reusing existing `ioredis` connection.
- Prisma migrations for **all** email-related schema changes (so F2–F7 don't fight migrations).
- Env vars added to `apps/api/.env.example` and `apps/email-worker/.env.example`.
- Resend SDK + Mailgun SDK installed.
- Provider-client *factories* (no business logic, just `getResendClient()` / `getMailgunClient()`).
- Worker bootstrap: process boot, Redis connection, structured logger (use `pino`), graceful SIGTERM, `/health` endpoint.

### Out of scope (handled elsewhere)
- Actual sending logic → **F2**.
- Templates → **F2/F3**.
- Inbound webhook endpoint → **F4**.
- Resend webhook endpoint → **F7**.
- Matching logic → **F5**.

## Implementation Plan
1. Create `packages/email-contracts/` workspace with `package.json`, `tsconfig.json`, `src/jobs.ts`, `src/index.ts`. Add zod schemas.
2. Create `apps/email-worker/` workspace with `package.json`, `tsconfig.json`, `src/index.ts` (boot), `src/config/`, `src/providers/`, `src/workers/`. Wire pino logger.
3. Update root `pnpm-workspace.yaml` if needed (it should already include `apps/*` and `packages/*`).
4. Add Prisma models in `apps/api/prisma/schema.prisma`: `EmailMessage`, `InboundEmail`. Add `replyToken` field to `RFPSupplier`. Add reverse relations.
5. Run `pnpm --filter @apps/api prisma migrate dev --name email_infrastructure`.
6. Add env vars to both `.env.example` files.
7. Add `apps/api/src/config/queue.ts` exporting `outboundQueue`, `inboundQueue` instances backed by existing Redis.
8. Implement `apps/email-worker/src/providers/clients.ts` with `getResendClient()` and `getMailgunClient()` factories.
9. Implement `apps/email-worker/src/index.ts`: boot, register a placeholder worker (no-op handler), set up SIGTERM/SIGINT handlers, expose `/health` (port from env).
10. Verify `pnpm install && pnpm --filter @apps/api build && pnpm --filter @apps/email-worker build` passes.

## Files

### To create
- `packages/email-contracts/package.json`
- `packages/email-contracts/tsconfig.json`
- `packages/email-contracts/src/index.ts`
- `packages/email-contracts/src/jobs.ts`
- `apps/email-worker/package.json`
- `apps/email-worker/tsconfig.json`
- `apps/email-worker/src/index.ts`
- `apps/email-worker/src/config/env.ts`
- `apps/email-worker/src/config/redis.ts`
- `apps/email-worker/src/config/logger.ts`
- `apps/email-worker/src/providers/clients.ts`
- `apps/email-worker/src/workers/outboundWorker.ts` (skeleton — F2 fills in)
- `apps/email-worker/src/workers/inboundWorker.ts` (skeleton — F5 fills in)
- `apps/email-worker/.env.example`
- `apps/api/src/config/queue.ts`

### To modify
- `apps/api/prisma/schema.prisma` — add 2 models + 1 field + reverse relations.
- `apps/api/.env.example` — add email and queue env vars.
- `apps/api/package.json` — add `bullmq`.
- `apps/api/src/config/redis.ts` — export the existing connection so BullMQ reuses it (no new connection).
- root `package.json` — confirm scripts: `dev:worker`, `build:worker`.

## DB / Schema Changes

Append to `apps/api/prisma/schema.prisma`:

```prisma
model EmailMessage {
  id                Int       @id @default(autoincrement())
  rfpId             Int?
  supplierId        Int?
  userId            Int?
  idempotencyKey    String    @unique
  providerMessageId String?   @unique
  threadId          String?
  type              String
  toEmail           String
  fromEmail         String
  subject           String
  status            String    @default("queued")
  errorMessage      String?
  attemptCount      Int       @default(0)
  queuedAt          DateTime  @default(now())
  sentAt            DateTime?
  deliveredAt       DateTime?
  failedAt          DateTime?

  rfp      RFP?      @relation(fields: [rfpId], references: [id])
  supplier Supplier? @relation(fields: [supplierId], references: [id])

  @@index([rfpId])
  @@index([supplierId])
  @@index([status])
}

model InboundEmail {
  id                Int       @id @default(autoincrement())
  rfpId             Int?
  supplierId        Int?
  matchedBy         String?   // "plus_address" | "in_reply_to" | "references" | "from_email"
  providerMessageId String    @unique
  inReplyTo         String?
  references        String?
  fromEmail         String
  toEmail           String
  subject           String
  bodyText          String?
  bodyHtml          String?
  rawPayload        Json
  status            String    @default("received") // received | matched | unmatched | failed
  errorMessage      String?
  extractionStatus  String?   // null | pending | extracted | skipped | failed (F8)
  receivedAt        DateTime  @default(now())
  processedAt       DateTime?

  rfp      RFP?      @relation(fields: [rfpId], references: [id])
  supplier Supplier? @relation(fields: [supplierId], references: [id])

  @@index([rfpId])
  @@index([supplierId])
  @@index([status])
}

// Modify existing RFPSupplier:
model RFPSupplier {
  // ... existing fields ...
  replyToken String? @unique // F3 will populate; nullable so F1 migration is non-breaking
}

// Add reverse relations to existing models:
model RFP {
  // ... existing fields ...
  emailMessages EmailMessage[]
  inboundEmails InboundEmail[]
}

model Supplier {
  // ... existing fields ...
  emailMessages EmailMessage[]
  inboundEmails InboundEmail[]
}
```

Run: `pnpm --filter @apps/api prisma migrate dev --name email_infrastructure`.

## Config / Env Vars

`apps/api/.env.example` (append):
```bash
# Email — outbound
RESEND_API_KEY=
RESEND_FROM_EMAIL=rfp@yourdomain.com
RESEND_FROM_NAME=RFP System

# Email — inbound
MAILGUN_API_KEY=
MAILGUN_INBOUND_DOMAIN=reply.yourdomain.com
MAILGUN_WEBHOOK_SIGNING_KEY=

# Reply addressing
REPLY_ADDRESS_DOMAIN=reply.yourdomain.com
REPLY_ADDRESS_LOCAL_PART=rfp

# Queue
EMAIL_OUTBOUND_QUEUE=email-outbound
EMAIL_INBOUND_QUEUE=email-inbound

# Feature flag
EMAIL_ENABLED=true
```

`apps/email-worker/.env.example` (new file): same content as above plus:
```bash
NODE_ENV=development
WORKER_PORT=8081
LOG_LEVEL=info

# DB (worker reads EmailMessage / InboundEmail rows)
DATABASE_URL=

# Redis (must match API)
REDIS_URL=
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Packages

In root:
```bash
# (no root-level changes)
```

In `apps/api`:
```bash
pnpm --filter @apps/api add bullmq
```

In new `apps/email-worker`:
```bash
pnpm --filter @apps/email-worker add bullmq ioredis resend mailgun.js form-data zod pino @prisma/client
pnpm --filter @apps/email-worker add -D typescript tsx @types/node
```

In new `packages/email-contracts`:
```bash
pnpm --filter @apps/email-contracts add zod
pnpm --filter @apps/email-contracts add -D typescript
```

## Contracts Exported

For F2–F8 to consume:

```ts
// packages/email-contracts/src/jobs.ts
import { z } from "zod";

export const SendOtpJob = z.object({
  type: z.literal("send_otp"),
  idempotencyKey: z.string(),
  to: z.string().email(),
  otp: z.string(),
  userId: z.number().optional(),
});

export const SendRfpInvitationJob = z.object({
  type: z.literal("send_rfp_invitation"),
  idempotencyKey: z.string(),
  rfpId: z.number(),
  supplierId: z.number(),
  rfpSupplierId: z.number(),
  to: z.string().email(),
  replyToken: z.string(),
  rfpCode: z.string(),
  rfpSubject: z.string(),
  senderUserName: z.string().optional(),
});

export const SendResponseConfirmedJob = z.object({
  type: z.literal("send_response_confirmed"),
  idempotencyKey: z.string(),
  rfpId: z.number(),
  supplierId: z.number(),
  to: z.string().email(),
  rfpSubject: z.string(),
});

export const TestSendJob = z.object({
  type: z.literal("test_send"),
  idempotencyKey: z.string(),
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
});

export const OutboundJob = z.discriminatedUnion("type", [
  SendOtpJob,
  SendRfpInvitationJob,
  SendResponseConfirmedJob,
  TestSendJob,
]);
export type OutboundJob = z.infer<typeof OutboundJob>;

export const ProcessInboundJob = z.object({
  type: z.literal("process_inbound"),
  inboundEmailId: z.number(),
});
export type ProcessInboundJob = z.infer<typeof ProcessInboundJob>;
```

```ts
// apps/api/src/config/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { redisClient } from "./redis";
import type { OutboundJob, ProcessInboundJob } from "@apps/email-contracts";
import { env } from "./env";

const connection = redisClient; // reuse existing connection

export const outboundQueue = new Queue<OutboundJob>(
  env.EMAIL_OUTBOUND_QUEUE,
  { connection }
);

export const inboundQueue = new Queue<ProcessInboundJob>(
  env.EMAIL_INBOUND_QUEUE,
  { connection }
);
```

```ts
// apps/email-worker/src/providers/clients.ts
import { Resend } from "resend";
import Mailgun from "mailgun.js";
import formData from "form-data";
import { env } from "../config/env";

let resend: Resend | null = null;
export function getResendClient(): Resend {
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

let mailgun: ReturnType<Mailgun["client"]> | null = null;
export function getMailgunClient() {
  if (!mailgun) {
    const mg = new Mailgun(formData);
    mailgun = mg.client({ username: "api", key: env.MAILGUN_API_KEY });
  }
  return mailgun;
}
```

## Code Sketches

```ts
// apps/email-worker/src/index.ts
import http from "node:http";
import { Worker } from "bullmq";
import { logger } from "./config/logger";
import { redisConnection } from "./config/redis";
import { env } from "./config/env";

// Skeleton workers — F2 and F5 fill in handlers.
const outboundWorker = new Worker(
  env.EMAIL_OUTBOUND_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, "outbound job (skeleton)");
  },
  { connection: redisConnection }
);

const inboundWorker = new Worker(
  env.EMAIL_INBOUND_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id }, "inbound job (skeleton)");
  },
  { connection: redisConnection }
);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(env.WORKER_PORT, () => {
  logger.info({ port: env.WORKER_PORT }, "email-worker started");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await outboundWorker.close();
  await inboundWorker.close();
  server.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## Testing
- Unit: zod schema parsing — valid + invalid payloads.
- Smoke: start worker locally → confirm logs "started", `/health` returns 200, SIGTERM exits cleanly.
- Migration: `prisma migrate reset && prisma migrate dev` on a clean DB → succeeds.
- Build: both apps build with no TS errors.

## Acceptance Criteria
- [ ] `pnpm install` at repo root succeeds.
- [ ] `pnpm --filter @apps/api build` passes.
- [ ] `pnpm --filter @apps/email-worker build` passes.
- [ ] `pnpm --filter @apps/api prisma migrate dev` applies without error.
- [ ] Worker process starts and connects to Redis.
- [ ] `curl localhost:8081/health` returns 200.
- [ ] SIGTERM exits the worker cleanly within 5s.
- [ ] Enqueueing an `OutboundJob` from API → log line in worker confirms receipt.
- [ ] Zod parses each `OutboundJob` variant; invalid payloads throw at enqueue time.

## Open Questions
- [ ] Use `pino-pretty` in dev only? Recommended yes.
- [ ] Worker concurrency — start with default (1) or set higher? Recommend 5 for outbound, 3 for inbound.
- [ ] Add `extractionStatus` field on `InboundEmail` now (for F8) or wait? **Recommendation: add now to avoid a second migration later.**
- [ ] Is the existing `apps/api/src/config/redis.ts` BullMQ-compatible (must have `maxRetriesPerRequest: null` for blocking commands)? Verify before reuse; if not, create a separate connection.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §3 (Architecture), §4 (Project Structure), §5 (Schema), §6 (Env Vars), §8 (Packages), §10 (Job Payloads).
- Downstream features that consume F1: F2, F3, F4, F5, F6, F7, F8 — all of them.
