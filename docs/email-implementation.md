# Email Implementation Plan

> Living document — update inline as decisions change. Last reviewed: 2026-05-02.

## 1. Goals

Build the email layer for the RFP system so that:
- Suppliers receive RFP invitations via email.
- Suppliers can reply by email; replies are captured, parsed, and linked back to the right RFP + supplier.
- OTP / auth emails are sent reliably.
- Failures retry automatically; the API is never blocked on SMTP latency.

Non-goals (for v1):
- Marketing / bulk newsletters.
- Click and open tracking (can be added later via webhook events).
- Inbound attachments larger than 10 MB.

---

## 2. Tools Selected

| Purpose | Tool | Free tier | Why |
|---|---|---|---|
| Send | **Resend** | 3,000/mo, 100/day, permanent | Best Node/TS DX, full DKIM, no footer |
| Receive | **Mailgun Routes** | 100/day inbound, permanent | Cleanest free webhook with custom domain |
| Queue | **BullMQ on existing Redis** | OSS | Reuses infra we already have |

Backup options if either provider becomes unsuitable:
- Send fallback: AWS SES ($0.10/1k after $200 credit), Mailjet (200/day).
- Receive fallback: Postmark Inbound (100/mo), Brevo Inbound Parse (free w/ verified subdomain).

---

## 3. Architecture

```
┌─────────────┐  enqueue   ┌─────────┐   pull    ┌──────────────┐
│  apps/api   │──────────▶│  Redis  │──────────▶│ email-worker │──▶ Resend (send)
│  (Express)  │  (BullMQ) │  Queue  │  (BullMQ) │              │
└─────┬───────┘            └─────────┘           └──────────────┘
      │ ▲
      │ │ POST /webhooks/inbound/mailgun
      │ │
      ▼ │
   Mailgun Routes ◀───── reply email ◀───── Supplier
```

Key principles:
- **API never sends email directly.** It enqueues a job.
- **Inbound webhook lives in `apps/api`** (it has DB, auth, tenant context). The handler verifies the signature, persists the raw payload, enqueues a parse job, and returns 200 fast.
- **Worker handles both outbound and inbound.** Two queues (`email-outbound`, `email-inbound`), one process.
- **Idempotent jobs.** Every job carries a stable key so retries never double-send.
- **Duplicate webhooks are expected.** Both Mailgun and Resend retry; every webhook handler must be idempotent. See §13a for the full strategy.

---

## 4. Project Structure

```
rfp-system/
├── apps/
│   ├── api/                    # existing
│   │   └── src/
│   │       ├── controllers/
│   │       │   └── webhookController.ts    [NEW] Mailgun inbound webhook
│   │       ├── routes/
│   │       │   └── webhookRoutes.ts        [NEW] /webhooks/inbound/mailgun
│   │       ├── service/
│   │       │   └── emailQueueService.ts    [NEW] enqueue helpers
│   │       └── config/
│   │           └── queue.ts                [NEW] BullMQ Queue instances
│   ├── email-worker/           [NEW] separate process
│   │   ├── src/
│   │   │   ├── index.ts                    boot workers
│   │   │   ├── workers/
│   │   │   │   ├── outboundWorker.ts       process outbound jobs
│   │   │   │   └── inboundWorker.ts        process inbound jobs
│   │   │   ├── providers/
│   │   │   │   ├── resendProvider.ts       Resend client wrapper
│   │   │   │   └── mailgunInboundParser.ts parse Mailgun payload
│   │   │   ├── templates/
│   │   │   │   ├── rfpInvitation.tsx       (or .html)
│   │   │   │   ├── otp.tsx
│   │   │   │   └── responseConfirmed.tsx
│   │   │   └── handlers/
│   │   │       ├── sendRfpInvitation.ts
│   │   │       ├── sendOtp.ts
│   │   │       └── processInboundReply.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # existing
└── packages/
    └── email-contracts/        [NEW] shared types
        ├── src/
        │   ├── jobs.ts         OutboundJobPayload, InboundJobPayload, etc.
        │   └── index.ts
        └── package.json
```

Why a shared `packages/email-contracts`: API and worker both need the job payload types; defining them once prevents drift.

---

## 5. Database Schema Changes

Add three models to `apps/api/prisma/schema.prisma`:

```prisma
model EmailMessage {
  id              Int       @id @default(autoincrement())
  // routing
  rfpId           Int?
  supplierId      Int?
  userId          Int?      // for OTP / non-RFP emails
  // identification
  idempotencyKey  String    @unique  // e.g. "rfp:123:supplier:45:invite"
  providerMessageId String? @unique  // Resend's id
  threadId        String?              // for grouping replies
  // content
  type            String    // "rfp_invitation" | "otp" | "response_confirmed" | ...
  toEmail         String
  fromEmail       String
  subject         String
  // status
  status          String    @default("queued")  // queued | sent | delivered | bounced | failed
  errorMessage    String?
  attemptCount    Int       @default(0)
  // timestamps
  queuedAt        DateTime  @default(now())
  sentAt          DateTime?
  deliveredAt     DateTime?
  failedAt        DateTime?

  rfp             RFP?      @relation(fields: [rfpId], references: [id])
  supplier        Supplier? @relation(fields: [supplierId], references: [id])

  @@index([rfpId])
  @@index([supplierId])
  @@index([status])
}

model InboundEmail {
  id              Int       @id @default(autoincrement())
  // routing (filled after parsing)
  rfpId           Int?
  supplierId      Int?
  matchedBy       String?   // "plus_address" | "in_reply_to" | "references" | "from_email"
  // identification
  providerMessageId String  @unique  // Mailgun's Message-Id header
  inReplyTo       String?
  references      String?
  // content
  fromEmail       String
  toEmail         String    // e.g. rfp+123.45@reply.yourdomain.com
  subject         String
  bodyText        String?
  bodyHtml        String?
  rawPayload      Json      // full webhook body for debugging
  // status
  status          String    @default("received")  // received | parsed | matched | unmatched | failed
  errorMessage    String?
  // timestamps
  receivedAt      DateTime  @default(now())
  processedAt     DateTime?

  rfp             RFP?      @relation(fields: [rfpId], references: [id])
  supplier        Supplier? @relation(fields: [supplierId], references: [id])

  @@index([rfpId])
  @@index([supplierId])
  @@index([status])
}

// Add reverse relations to existing models:
model RFP { ... emails EmailMessage[]  inboundEmails InboundEmail[] }
model Supplier { ... emails EmailMessage[]  inboundEmails InboundEmail[] }
```

Update `RFPSupplier` to also store the per-supplier reply token used in the plus-address (so a supplier can be matched even if the address is forwarded):
```prisma
model RFPSupplier {
  ...
  replyToken      String   @unique  // random short string
}
```

---

## 6. Environment Variables

Add to `apps/api/.env` and `apps/email-worker/.env`:

```bash
# Provider — sending
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=rfp@yourdomain.com
RESEND_FROM_NAME="RFP System"

# Provider — receiving
MAILGUN_API_KEY=key-xxx                  # for verifying webhook signatures
MAILGUN_INBOUND_DOMAIN=reply.yourdomain.com
MAILGUN_WEBHOOK_SIGNING_KEY=xxx          # separate from API key

# Reply addressing
REPLY_ADDRESS_DOMAIN=reply.yourdomain.com
REPLY_ADDRESS_LOCAL_PART=rfp             # so emails go to rfp+token@reply.yourdomain.com

# Queue (reuse existing Redis env)
EMAIL_OUTBOUND_QUEUE=email-outbound
EMAIL_INBOUND_QUEUE=email-inbound

# Feature flag
EMAIL_ENABLED=true
```

Update `apps/api/src/config/env.ts` with these (we removed the Resend block earlier — re-add a clean version under a new name like `EMAIL_*`).

Add to `.env.example` (without secrets) so the next dev knows what to configure.

---

## 7. DNS Setup (one-time, manual)

These must be done in your domain registrar / DNS provider:

**For sending (Resend):**
- Add the SPF, DKIM (3 CNAME records), DMARC records that Resend's dashboard generates after you add your domain.
- Verify domain in Resend dashboard.

**For receiving (Mailgun):**
- Set up subdomain `reply.yourdomain.com` in Mailgun.
- Add MX records pointing to Mailgun's mail servers (`mxa.mailgun.org`, `mxb.mailgun.org`).
- Add the SPF/DKIM records Mailgun gives you (if you also want to send replies/auto-replies through Mailgun).
- Create a Route in Mailgun:
  - Match: `match_recipient(".*@reply.yourdomain.com")`
  - Action: `forward("https://api.yourdomain.com/webhooks/inbound/mailgun")` and `stop()`

---

## 8. Packages to Install

In `apps/api`:
```
pnpm add bullmq
```

In new `apps/email-worker`:
```
pnpm add bullmq ioredis resend mailparser zod @prisma/client
pnpm add -D typescript tsx @types/node @types/mailparser
```

In new `packages/email-contracts`:
```
pnpm add -D typescript zod
```

(`zod` validates job payloads at runtime so a bad enqueue can't crash the worker.)

---

## 9. Reply Address Strategy

We use **plus-addressing** (also called subaddressing) for the most robust reply matching:

```
rfp+<replyToken>@reply.yourdomain.com
```

Where `replyToken` is a random 12-char string stored on `RFPSupplier.replyToken`. Why a token (not just `rfpId.supplierId`):
- Hides internal IDs.
- Supplier can't tamper to spoof another supplier.
- Single lookup: `findUnique({ where: { replyToken } })`.

Matching priority in `processInboundReply`:
1. Parse the local part of `to` → look up `RFPSupplier` by `replyToken`. (primary)
2. Fall back to `In-Reply-To` header → match against `EmailMessage.providerMessageId`.
3. Fall back to `from` email → match `Supplier.email`, but only if RFP context is unambiguous (e.g. supplier has exactly one open RFP).
4. If nothing matches → mark `InboundEmail.status = "unmatched"` and surface in admin UI.

---

## 10. Job Payloads (in `packages/email-contracts/src/jobs.ts`)

```ts
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

export const OutboundJob = z.discriminatedUnion("type", [
  SendOtpJob,
  SendRfpInvitationJob,
]);
export type OutboundJob = z.infer<typeof OutboundJob>;

export const ProcessInboundJob = z.object({
  type: z.literal("process_inbound"),
  inboundEmailId: z.number(),
});
export type ProcessInboundJob = z.infer<typeof ProcessInboundJob>;
```

---

## 11. Implementation Phases

### Phase 1 — Infrastructure (½ day)
- [ ] Create `packages/email-contracts` with job schemas.
- [ ] Create `apps/email-worker` skeleton (boot, config, Redis connection).
- [ ] Add `apps/api/src/config/queue.ts` exporting `outboundQueue`, `inboundQueue`.
- [ ] Add Prisma models (`EmailMessage`, `InboundEmail`, `RFPSupplier.replyToken`); run migration.
- [ ] Update `pnpm-workspace.yaml` if needed; verify `pnpm install` works.

### Phase 2 — Outbound (1 day)
- [ ] Set up Resend account, verify domain, get API key.
- [ ] Implement `resendProvider.send()` in worker.
- [ ] Implement `outboundWorker` consuming `email-outbound` queue.
- [ ] Implement `sendRfpInvitation` handler (renders template, calls provider, updates `EmailMessage` row).
- [ ] Implement `sendOtp` handler. Wire `apps/api/src/utils/opt.ts` to enqueue instead of generating-only.
- [ ] Wire RFP submission flow: when an RFP transitions to `submitted`, generate `replyToken` per supplier, create `EmailMessage` row with `status: "queued"`, enqueue job.

### Phase 3 — Inbound (1 day)
- [ ] Set up Mailgun account, verify reply subdomain, configure Route.
- [ ] Build `POST /webhooks/inbound/mailgun` in API: verify HMAC signature, **dedup by Mailgun token (Redis SETNX) + Message-Id (DB unique)**, persist `InboundEmail` row, enqueue `process_inbound` job with `jobId: inbound:<id>`, return 200.
- [ ] Build `POST /webhooks/resend` for delivery events: verify Svix signature, **dedup by event id (Redis SETNX, 7-day TTL)**, conditional update of `EmailMessage.status` (forward-only state machine).
- [ ] Implement `inboundWorker` consuming `email-inbound` queue.
- [ ] Implement `processInboundReply`: match by replyToken / In-Reply-To / from, update `RFPSupplier.respondedAt + status`, update `InboundEmail` row.
- [ ] (Optional) auto-send `responseConfirmed` email back to supplier (idempotent — guard with `EmailMessage` row check).

### Phase 4 — Tracking & ops (½ day)
- [ ] Subscribe to Resend webhooks (`delivered`, `bounced`, `complained`) → update `EmailMessage.status`.
- [ ] Add admin endpoint to list unmatched `InboundEmail` rows.
- [ ] Add basic structured logging in worker.
- [ ] Document runbook: "supplier didn't get email" / "reply not threaded" debug steps.

### Phase 5 — Deploy
- [ ] Add Dockerfile for worker (or extend existing one with target stage).
- [ ] Configure deploy platform (Railway / Fly / ECS) to run two services from same repo.
- [ ] Verify both services share the same Redis instance.

---

## 12. Idempotency

Every outbound job carries an `idempotencyKey`. The worker:
1. Checks for an existing `EmailMessage` row with that key.
2. If `status` is `sent` or `delivered`, no-op (BullMQ retries don't double-send).
3. If `status` is `queued` or `failed`, attempts the send.

Suggested key formats:
- `otp:{email}:{timestamp_minute}` (one OTP per email per minute)
- `rfp:{rfpId}:supplier:{supplierId}:invite` (one invite per supplier per RFP)
- `rfp:{rfpId}:supplier:{supplierId}:reminder:{n}` (numbered reminders)

---

## 13a. Duplicate Webhook Handling

Both Mailgun and Resend will retry webhooks (typically 5–8 times over 24 hours) when our endpoint returns a 5xx, times out, or the connection fails. Slow processing also triggers retries. Our endpoints **must** be idempotent.

### Inbound webhooks (Mailgun)

Mailgun signs every request with `timestamp + token + signature`. The `token` is unique per delivery attempt — not per email — so it can't be used for deduplication. Use the email's own **Message-Id header** instead, which Mailgun forwards as `Message-Id` in the payload (and is globally unique per email).

The webhook handler in `apps/api/src/controllers/webhookController.ts`:

```ts
export async function mailgunInbound(req, res) {
  // 1. Verify HMAC signature first (reject forgeries before any DB write)
  if (!verifyMailgunSignature(req.body)) {
    return res.status(401).end();
  }

  // 2. Replay protection: reject signatures older than 5 minutes
  const ageSec = Math.floor(Date.now() / 1000) - Number(req.body.timestamp);
  if (ageSec > 300) return res.status(401).end();

  // 3. Token-based dedup of the *signature itself* (cheap, Redis SETNX)
  const tokenKey = `mailgun:webhook:token:${req.body.token}`;
  const isNew = await redis.set(tokenKey, "1", "EX", 600, "NX");
  if (!isNew) return res.status(200).end();   // already seen this exact request

  // 4. Persist InboundEmail with Message-Id as the unique key.
  //    If the same email arrives via a duplicate webhook, this throws on the
  //    unique constraint — catch and treat as success.
  try {
    const inbound = await prisma.inboundEmail.create({ data: { providerMessageId, ... } });
    await inboundQueue.add("process_inbound", { inboundEmailId: inbound.id }, {
      jobId: `inbound:${inbound.id}`,   // BullMQ-level dedup
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e, "providerMessageId")) {
      return res.status(200).end();    // already processed — be idempotent
    }
    throw e;
  }

  return res.status(200).end();
}
```

Three layers of dedup:
1. **Mailgun token in Redis** (10-min TTL) — catches retries of the exact same HTTP request.
2. **`InboundEmail.providerMessageId` unique constraint** — catches the case where Mailgun re-delivers the email itself (rare, but possible if their queue does not snapshot delivery state).
3. **BullMQ `jobId`** — even if a job is enqueued twice with the same `jobId`, BullMQ ignores the duplicate.

### Resend delivery webhooks (`email.delivered`, `email.bounced`, etc.)

Each Resend event carries a unique `id` and an `email_id` (matches our `EmailMessage.providerMessageId`). Use both:

```ts
// Verify Svix-style signature (Resend uses Svix)
verifyResendSignature(req.headers, req.rawBody);

const eventId = req.body.id;
const dedupKey = `resend:event:${eventId}`;
const isNew = await redis.set(dedupKey, "1", "EX", 7 * 86400, "NX");
if (!isNew) return res.status(200).end();

// Update EmailMessage status. Use a conditional update so out-of-order events
// don't downgrade status (e.g. a late "sent" event after "delivered").
await prisma.emailMessage.updateMany({
  where: {
    providerMessageId: req.body.data.email_id,
    status: { in: precedingStatesFor(req.body.type) },
  },
  data: { status: nextStatusFor(req.body.type), ...timestamps },
});
```

Out-of-order delivery is a real concern: webhooks can arrive in any order. Treat email status as a state machine and **only allow forward transitions**:

```
queued → sent → delivered
              ↘ bounced (terminal)
              ↘ complained (terminal)
       ↘ failed (terminal)
```

### BullMQ retries vs webhook retries

These are independent and both need idempotency:
- A webhook retry can re-enqueue the same job → handled by BullMQ `jobId`.
- A BullMQ retry of an outbound send can re-call Resend → handled by the `EmailMessage.status` check inside the worker (`if status in (sent, delivered) → no-op`).

### Endpoint performance budget

Mailgun retries if the webhook takes more than ~30s; Resend retries on 5xx or timeout. Keep the handler under **2 seconds**:
- Verify signature (fast).
- One `INSERT` for `InboundEmail`.
- One `queue.add()`.
- Return 200.

Push every expensive operation (parsing MIME, matching to RFPs, sending auto-replies) into the worker.

### Testing duplicates

In CI / local:
- Replay the same captured webhook payload twice; assert one `InboundEmail` row and one `RFPSupplier.respondedAt` update.
- Replay events out of order (`delivered` before `sent`); assert final status is `delivered` and `sentAt` is still populated.
- Replay an event > 5 min old; assert 401.

---

## 13b. Retry Strategy

BullMQ config for outbound queue:
```ts
{
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 }, // 1m, 2m, 4m, 8m, 16m
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 7 * 86400 },                // keep failures a week
}
```

Distinguish errors:
- **4xx from Resend** (invalid email, blacklisted) → mark `failed`, don't retry.
- **5xx / network** → throw, let BullMQ retry.

---

## 14. Testing Strategy

- **Unit:** template rendering, payload validation (zod), inbound parser, replyToken generator.
- **Integration:** spin up Redis in CI, enqueue a job, assert worker processes it (mock provider).
- **Local end-to-end:**
  - Send: use Resend test mode + a real address; verify `EmailMessage.status` becomes `delivered`.
  - Receive: use Mailgun's "Send sample POST" to your local webhook (via ngrok); verify `InboundEmail` row + `RFPSupplier.respondedAt`.
- **Duplicate-webhook tests** (see §13a): replay the same payload twice → one row; replay events out of order → final state correct; replay > 5 min old → 401.
- **Manual smoke before prod:** send to your own email, hit reply, verify it threads.

---

## 15. Open Decisions

- [ ] **Reply portal vs reply-by-email:** This plan supports reply-by-email. Do we *also* want to include a portal link (`https://app/.../respond/{replyToken}`) in the invitation? Hybrid is common.
- [ ] **Auto-reply on receive:** Send a "We got your reply" email back to supplier? Default: yes, but only once per RFP.
- [ ] **Attachment handling:** v1 — store filename and size in `InboundEmail`; defer actual storage (S3/R2) to v2.
- [ ] **PII / retention:** how long to keep `InboundEmail.rawPayload`? Suggest 90 days then nullify.
- [ ] **Multiple replies from same supplier:** treat each as a new `InboundEmail` but only update `RFPSupplier.respondedAt` on the first.

---

## 16. Notes / Changelog

<!-- Append updates here as the implementation evolves. -->
- 2026-05-02: Initial draft.
- 2026-05-02: Added §13a Duplicate Webhook Handling (Mailgun token dedup + Message-Id unique constraint + BullMQ jobId; Resend event-id dedup; forward-only status state machine).
