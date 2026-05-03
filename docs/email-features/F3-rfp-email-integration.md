# F3 — RFP Email Integration

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Wire RFP submission and the OTP flow to send mail through F2's outbound pipeline. This is where business semantics live: per-supplier reply tokens, RFP invitation template, OTP template, and the response-confirmed template. After F3, the **outbound half** of the email system is feature-complete from a user's perspective.

## Dependencies
- **F2** must be merged: handler registry, `enqueueOutbound`, outbound worker.
- **F1** schema (already includes `RFPSupplier.replyToken`).

## Scope

### In scope
- `replyToken` generator — 12-char URL-safe random; uniqueness ensured by DB column constraint.
- RFP submit hook: for each `RFPSupplier`, generate `replyToken`, call `enqueueOutbound({ type: "send_rfp_invitation", ... })`.
- Three handlers registered against F2's registry:
  - `send_rfp_invitation` — renders RFP invitation template, sets `Reply-To: rfp+<token>@reply.yourdomain.com`.
  - `send_otp` — renders OTP code into a plain HTML template.
  - `send_response_confirmed` — used by F6 when a supplier replies.
- Refactor `apps/api/src/utils/opt.ts` to enqueue `send_otp` instead of generating-only. Existing rate-limit logic preserved.
- Three plain HTML templates (no React Email).

### Out of scope (handled elsewhere)
- The actual sending mechanics → **F2**.
- Inbound matching by `replyToken` → **F5**.
- Updating `RFPSupplier.respondedAt` after a reply → **F6**.
- Delivery status updates from Resend webhooks → **F7**.

## Implementation Plan
1. Implement `apps/api/src/utils/replyToken.ts` — `generateReplyToken()` using `crypto.randomBytes(9).toString("base64url")` (12 chars).
2. Update RFP submission flow in `apps/api/src/service/rfpService.ts`:
   - When RFP transitions to `submitted`, fetch all `RFPSupplier` rows for the RFP.
   - For each, generate `replyToken` (only if null) and `update`.
   - Call `enqueueOutbound({ type: "send_rfp_invitation", idempotencyKey: \`rfp:${rfpId}:supplier:${supplierId}:invite\`, ... })`.
3. Refactor `apps/api/src/utils/opt.ts` `sendOtp(email)`:
   - Keep existing rate-limit logic.
   - After generating OTP and before storing in Redis, call `enqueueOutbound({ type: "send_otp", idempotencyKey: \`otp:${email}:${minuteBucket}\`, ... })`.
   - Idempotency key includes a 1-min bucket so retries within the same minute don't double-send but a fresh request after expiry does.
4. Add three handlers in `apps/email-worker/src/handlers/`:
   - `sendRfpInvitation.ts`
   - `sendOtp.ts`
   - `sendResponseConfirmed.ts`
5. Add three template files in `apps/email-worker/src/templates/`:
   - `rfpInvitation.ts` — exports `render({ rfpCode, rfpSubject, replyToken, senderUserName })` returning `{ subject, html, text }`.
   - `otp.ts` — exports `render({ otp })`.
   - `responseConfirmed.ts` — exports `render({ rfpSubject })`.
6. Register all three handlers in worker boot (`apps/email-worker/src/index.ts`).
7. Add a small integration test that submits an RFP with 2 suppliers and asserts 2 `EmailMessage` rows + 2 unique `replyToken`s on the `RFPSupplier` rows.

## Files

### To create
- `apps/api/src/utils/replyToken.ts`
- `apps/email-worker/src/handlers/sendRfpInvitation.ts`
- `apps/email-worker/src/handlers/sendOtp.ts`
- `apps/email-worker/src/handlers/sendResponseConfirmed.ts`
- `apps/email-worker/src/templates/rfpInvitation.ts`
- `apps/email-worker/src/templates/otp.ts`
- `apps/email-worker/src/templates/responseConfirmed.ts`

### To modify
- `apps/api/src/service/rfpService.ts` — add invitation-enqueue logic on submit.
- `apps/api/src/utils/opt.ts` — call `enqueueOutbound({ type: "send_otp" })` instead of relying on a now-removed email service.
- `apps/email-worker/src/index.ts` — register handlers at boot.
- `apps/api/src/repositories/rfpSupplierRepository.ts` (create if missing) — add `setReplyToken(rfpSupplierId, token)` helper.

## DB / Schema Changes
None — `replyToken` field already added in F1. F3 just populates it.

## Config / Env Vars
Consumes from F1:
- `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` (sender identity).
- `REPLY_ADDRESS_DOMAIN`, `REPLY_ADDRESS_LOCAL_PART` (constructs the per-supplier `Reply-To`).
- `FRONTEND_URL` (used in email body if we include a portal link — see Open Questions).

No new vars.

## Packages
None new.

## Contracts Exported
This feature mostly **consumes** F2's contracts. It does not export new functions to other features, except:

```ts
// apps/api/src/utils/replyToken.ts
export function generateReplyToken(): string;
```

— used by F6 (admin manual-match flow could re-issue a token).

## Code Sketches

```ts
// apps/api/src/utils/replyToken.ts
import crypto from "node:crypto";

export function generateReplyToken(): string {
  // 9 bytes base64url ≈ 12 chars, URL-safe, no padding.
  return crypto.randomBytes(9).toString("base64url");
}
```

```ts
// apps/api/src/service/rfpService.ts (excerpt — add to submit flow)
import { enqueueOutbound } from "./emailQueueService";
import { generateReplyToken } from "../utils/replyToken";

async function dispatchInvitations(rfpId: number) {
  const rfp = await prisma.rFP.findUniqueOrThrow({
    where: { id: rfpId },
    include: {
      user: true,
      suppliers: { include: { supplier: true } },
    },
  });

  for (const link of rfp.suppliers) {
    const token = link.replyToken ?? generateReplyToken();
    if (!link.replyToken) {
      await prisma.rFPSupplier.update({
        where: { id: link.id },
        data: { replyToken: token },
      });
    }

    await enqueueOutbound({
      type: "send_rfp_invitation",
      idempotencyKey: `rfp:${rfp.id}:supplier:${link.supplierId}:invite`,
      rfpId: rfp.id,
      supplierId: link.supplierId,
      rfpSupplierId: link.id,
      to: link.supplier.email,
      replyToken: token,
      rfpCode: rfp.code,
      rfpSubject: rfp.subject,
      senderUserName: rfp.user.name ?? undefined,
    });
  }
}
```

```ts
// apps/api/src/utils/opt.ts (after refactor — abridged)
import { enqueueOutbound } from "../service/emailQueueService";

export const sendOtp = async (email: string) => {
  // ... existing rate-limit + Redis logic, unchanged ...

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const minuteBucket = Math.floor(Date.now() / 60_000);

  await enqueueOutbound({
    type: "send_otp",
    idempotencyKey: `otp:${email}:${minuteBucket}`,
    to: email,
    otp,
  });

  await redisService.set(otpKey, otp, 60);
  await redisService.set(`otp:${email}_attempts`, String(numberOfAttempts + 1), 5 * 60);
  return otp;
};
```

```ts
// apps/email-worker/src/templates/rfpInvitation.ts
import { env } from "../config/env";

export function render(args: {
  rfpCode: string;
  rfpSubject: string;
  replyToken: string;
  senderUserName?: string;
}) {
  const replyAddress = `${env.REPLY_ADDRESS_LOCAL_PART}+${args.replyToken}@${env.REPLY_ADDRESS_DOMAIN}`;
  const portalUrl = `${env.FRONTEND_URL}/rfp/respond/${args.replyToken}`;

  const subject = `New RFP: ${args.rfpSubject} (${args.rfpCode})`;

  const html = `
    <p>Hello,</p>
    <p>${args.senderUserName ?? "A buyer"} has invited you to respond to RFP <strong>${args.rfpCode}</strong>:</p>
    <p><strong>${args.rfpSubject}</strong></p>
    <p>You can reply directly to this email with your quote, or use our portal:</p>
    <p><a href="${portalUrl}">Open response portal</a></p>
    <hr/>
    <p style="color:#666;font-size:12px">Replies should be sent to ${replyAddress} so we can match them to this RFP.</p>
  `;

  const text = [
    `Hello,`,
    `${args.senderUserName ?? "A buyer"} has invited you to respond to RFP ${args.rfpCode}: ${args.rfpSubject}.`,
    ``,
    `Reply to this email with your quote, or open: ${portalUrl}`,
    ``,
    `Replies should be sent to ${replyAddress}.`,
  ].join("\n");

  return { subject, html, text, replyTo: replyAddress };
}
```

```ts
// apps/email-worker/src/handlers/sendRfpInvitation.ts
import { registerOutboundHandler } from "./registry";
import { render } from "../templates/rfpInvitation";

registerOutboundHandler("send_rfp_invitation", async (job) => {
  const t = render({
    rfpCode: job.rfpCode,
    rfpSubject: job.rfpSubject,
    replyToken: job.replyToken,
    senderUserName: job.senderUserName,
  });
  return {
    subject: t.subject,
    html: t.html,
    text: t.text,
    replyTo: t.replyTo,
    headers: { "X-RFP-Id": String(job.rfpId), "X-Supplier-Id": String(job.supplierId) },
  };
});
```

```ts
// apps/email-worker/src/templates/otp.ts
export function render(args: { otp: string }) {
  const subject = `Your verification code: ${args.otp}`;
  const html = `
    <p>Your verification code is:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:4px">${args.otp}</p>
    <p>It expires in 60 seconds.</p>
  `;
  const text = `Your verification code is ${args.otp}. It expires in 60 seconds.`;
  return { subject, html, text };
}
```

## Testing
- **Unit:**
  - `generateReplyToken()` returns a 12-char URL-safe string; 1000 tokens have no collisions.
  - Each template renders with sample input → has subject, html, text.
- **Integration:**
  - Submit an RFP with 2 suppliers → 2 `EmailMessage` rows queued; both `RFPSupplier.replyToken` populated and unique.
  - Re-submitting (or replaying the submit) → no duplicate emails (idempotency key catches it).
  - OTP flow: register a user → `EmailMessage` row queued of type `send_otp`; OTP is in Redis as before; existing rate-limits still throw on the 3rd attempt.
- **Manual smoke:**
  - Run end-to-end with a real Resend sandbox key → invitation arrives in test inbox with the correct `Reply-To` plus-address.

## Acceptance Criteria
- [ ] Submitting an RFP with N suppliers → N `EmailMessage` rows + N populated `RFPSupplier.replyToken` (each unique).
- [ ] Each invitation email contains the correct `Reply-To: rfp+<token>@reply.yourdomain.com`.
- [ ] Each invitation email has both HTML and plain-text bodies; portal link present.
- [ ] OTP email arrives via the queue path; Redis OTP storage and rate limits unchanged.
- [ ] Resubmitting the same RFP with same supplier set → no duplicate emails.
- [ ] OTP requested twice within the same minute → idempotency key collapses to one email.

## Open Questions
- [ ] **Reply-by-email vs portal-link vs both?** Current draft includes both. Confirm with stakeholders. (See `/docs/email-implementation.md` §15.)
- [ ] Localization — single English template for v1, or design for i18n now? **Recommend single English** for v1.
- [ ] Should `senderUserName` fall back to a generic "RFP System" if `user.name` is null? Yes — already in template.
- [ ] Should we expose an admin endpoint to **resend** an invitation (e.g. supplier never got it)? Use case: re-issue with a new idempotency key (`...:invite:resend-1`). Defer to a follow-up.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §9 (Reply Address Strategy), §15 (Open Decisions — portal vs email).
- Upstream: [F1](./F1-email-infrastructure.md), [F2](./F2-outbound-email-system.md).
- Downstream: [F5](./F5-email-mapping.md) reads `RFPSupplier.replyToken` populated here. [F6](./F6-supplier-response-state.md) re-uses the `send_response_confirmed` handler registered here.
