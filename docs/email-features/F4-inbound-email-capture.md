# F4 — Inbound Email Capture

## Status
Not started   Owner: tbd   Effort: ~½ day

## Goal
Receive Mailgun's inbound webhook when a supplier replies, verify the request, persist the raw payload as an `InboundEmail` row, and enqueue a `process_inbound` job for the worker to handle. **No matching logic** — F5 owns that. **Minimal dedup** — F7 hardens it.

## Dependencies
- **F1** must be merged: `InboundEmail` model, `inboundQueue` instance, env vars.
- DNS for `reply.yourdomain.com` must be set up (Mailgun MX records + Route → webhook URL). This is one-time manual work tracked in `/docs/email-implementation.md` §7.

## Scope

### In scope
- `POST /webhooks/inbound/mailgun` route in `apps/api`, no auth middleware (signature-based instead).
- HMAC signature verification (basic — F7 will add replay-protection window + Redis dedup on the token).
- `InboundEmail.create()` storing raw payload as JSON, plus parsed convenience fields (from, to, subject, message-id, body text + html).
- Enqueue `{ type: "process_inbound", inboundEmailId }` job to `email-inbound`.
- Always return 200 inside 2 seconds; only return non-200 on signature failure (401) or transport error (500).
- Use `express.urlencoded()` middleware specifically scoped to this route — Mailgun posts `application/x-www-form-urlencoded`, **not** JSON.

### Out of scope (handled elsewhere)
- Matching to RFP/Supplier → **F5**.
- State updates on `RFPSupplier` → **F6**.
- Robust dedup (token replay, signed-timestamp window) → **F7**.
- Attachment parsing/storage → deferred per `/docs/email-implementation.md` §15.

## Implementation Plan
1. Add `apps/api/src/utils/webhookSignatures.ts` with `verifyMailgunSignature({ timestamp, token, signature })`. Use HMAC-SHA256 with `MAILGUN_WEBHOOK_SIGNING_KEY`. F7 will add replay-window check and Redis dedup; F4 just verifies the HMAC.
2. Add `apps/api/src/controllers/webhookController.ts` with `mailgunInbound` handler.
3. Add `apps/api/src/routes/webhookRoutes.ts` registering `POST /webhooks/inbound/mailgun` with route-scoped `express.urlencoded({ extended: true, limit: "20mb" })`.
4. Mount router in `apps/api/src/app.ts` BEFORE the auth middleware so it's a public endpoint.
5. Persist `InboundEmail` row. Catch Prisma `P2002` on `providerMessageId` (the Message-Id is already a unique column from F1) and treat as success — return 200.
6. Enqueue with `jobId = inbound:${inboundEmail.id}` (BullMQ-level dedup belt + braces).
7. Return 200 with `{ ok: true, id: inboundEmail.id }` for debugging.

## Files

### To create
- `apps/api/src/utils/webhookSignatures.ts`
- `apps/api/src/controllers/webhookController.ts`
- `apps/api/src/routes/webhookRoutes.ts`
- `apps/api/src/repositories/inboundEmailRepository.ts`

### To modify
- `apps/api/src/app.ts` — mount `/webhooks` router as a public route.

## DB / Schema Changes
None — `InboundEmail` already exists from F1. F4 only writes rows.

State transitions F4 owns:
```
(no row) ──► InboundEmail.status = "received"
```

## Config / Env Vars
Consumes from F1:
- `MAILGUN_WEBHOOK_SIGNING_KEY` — for HMAC verification.
- `MAILGUN_INBOUND_DOMAIN` — to validate the `recipient` address looks right (sanity check).
- `EMAIL_INBOUND_QUEUE` — queue name.

No new vars.

## Packages
None new beyond F1.

## Contracts Exported
- HTTP endpoint: `POST /webhooks/inbound/mailgun`
- Side-effect contract: every authentic Mailgun inbound delivery → exactly one `InboundEmail` row with `status = "received"` and one enqueued `process_inbound` job.

```ts
// apps/api/src/utils/webhookSignatures.ts
export function verifyMailgunSignature(args: {
  timestamp: string;
  token: string;
  signature: string;
}): boolean;
```

## Code Sketches

```ts
// apps/api/src/utils/webhookSignatures.ts
import crypto from "node:crypto";
import { env } from "../config/env";

export function verifyMailgunSignature(args: {
  timestamp: string;
  token: string;
  signature: string;
}): boolean {
  const data = args.timestamp + args.token;
  const expected = crypto
    .createHmac("sha256", env.MAILGUN_WEBHOOK_SIGNING_KEY)
    .update(data)
    .digest("hex");
  // Use timing-safe compare to defend against timing attacks.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(args.signature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```ts
// apps/api/src/controllers/webhookController.ts
import type { Request, Response } from "express";
import { verifyMailgunSignature } from "../utils/webhookSignatures";
import { prisma } from "../config/database";
import { inboundQueue } from "../config/queue";
import { logger } from "../config/logger";

export async function mailgunInbound(req: Request, res: Response) {
  const body = req.body as Record<string, string>;

  // 1. Signature
  const ok = verifyMailgunSignature({
    timestamp: body.timestamp,
    token: body.token,
    signature: body.signature,
  });
  if (!ok) {
    logger.warn({ token: body.token }, "mailgun signature invalid");
    return res.status(401).end();
  }

  // 2. Persist InboundEmail (rely on Message-Id unique constraint for dedup).
  const messageId = body["Message-Id"] ?? body["message-id"] ?? body["Message-ID"];
  if (!messageId) {
    logger.warn("mailgun payload missing Message-Id");
    return res.status(400).end();
  }

  try {
    const row = await prisma.inboundEmail.create({
      data: {
        providerMessageId: messageId,
        inReplyTo: body["In-Reply-To"] ?? null,
        references: body["References"] ?? null,
        fromEmail: body.sender ?? body.from ?? "",
        toEmail: body.recipient ?? "",
        subject: body.subject ?? "",
        bodyText: body["body-plain"] ?? null,
        bodyHtml: body["body-html"] ?? null,
        rawPayload: body,
        status: "received",
      },
    });

    await inboundQueue.add(
      "process_inbound",
      { type: "process_inbound", inboundEmailId: row.id },
      { jobId: `inbound:${row.id}` }
    );

    return res.status(200).json({ ok: true, id: row.id });
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Duplicate Message-Id — already processed. Idempotent success.
      logger.info({ messageId }, "duplicate inbound, returning 200");
      return res.status(200).json({ ok: true, duplicate: true });
    }
    logger.error({ err }, "inbound capture failed");
    return res.status(500).end();
  }
}
```

```ts
// apps/api/src/routes/webhookRoutes.ts
import { Router } from "express";
import express from "express";
import { mailgunInbound } from "../controllers/webhookController";

const router = Router();

router.post(
  "/inbound/mailgun",
  express.urlencoded({ extended: true, limit: "20mb" }),
  mailgunInbound
);

export default router;
```

```ts
// apps/api/src/app.ts (excerpt — add before auth middleware)
import webhookRoutes from "./routes/webhookRoutes";

// Public, signature-verified endpoints.
app.use("/webhooks", webhookRoutes);

// ... existing auth-protected routes ...
```

## Testing
- **Unit:**
  - `verifyMailgunSignature()` returns true for a known-good fixture, false for tampered.
  - Timing-safe compare path covered (lengths differ, hex differs).
- **Integration:**
  - POST a captured Mailgun fixture (form-urlencoded) → 200, `InboundEmail` row exists with parsed fields.
  - POST same fixture again → 200 (duplicate), still one row.
  - POST with invalid signature → 401, no row.
  - POST without Message-Id → 400, no row.
- **Local end-to-end (via ngrok):**
  - Use Mailgun's "Send sample POST" feature pointed at your ngrok URL → row appears, queue job enqueued.
- **Performance:**
  - Endpoint p95 < 1s under 100 concurrent posts (Apache Bench / k6).

## Acceptance Criteria
- [ ] `POST /webhooks/inbound/mailgun` exists and is publicly reachable (no auth middleware).
- [ ] Valid Mailgun fixture → 200 + new `InboundEmail` row + new `inbound:<id>` BullMQ job.
- [ ] Invalid signature → 401, no row, no job.
- [ ] Duplicate Message-Id → 200, single row preserved.
- [ ] Endpoint returns within 2s under typical load.
- [ ] `InboundEmail.rawPayload` contains the full original payload (for later debugging).
- [ ] Worker logs receipt of the `process_inbound` job (skeleton handler from F1 prints log line).

## Open Questions
- [ ] Mailgun lets you choose between "store and forward" and "forward only". Use **forward only** (we persist ourselves). Confirm Route is configured with `forward()` + `stop()`, not `store()`.
- [ ] Body size limit — set 20MB to match Mailgun's max attachment-payload size? Even if we defer attachments to v2, the JSON form payload itself can be large with embedded HTML.
- [ ] Should we strip the `rawPayload` of `body-html` before persisting (it can be huge)? **Recommend no** — keep it; F8 may want it for AI extraction.
- [ ] Multiple `Message-Id` header casing variants exist (`Message-Id`, `message-id`, `Message-ID`). Current sketch handles three. Confirm Mailgun's exact casing in fixture.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §3 (Architecture — inbound flow), §7 (DNS Setup), §13a (Duplicate Webhook Handling — F7 will harden this).
- Upstream: [F1](./F1-email-infrastructure.md).
- Downstream: [F5](./F5-email-mapping.md) consumes the `InboundEmail` rows produced here. [F7](./F7-reliability-dedup-retry.md) layers token-replay protection on top of this controller.
