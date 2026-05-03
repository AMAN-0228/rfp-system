# F5 — Email Mapping

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Match an `InboundEmail` row (produced by F4) to a specific `(rfpId, supplierId)` pair. This is the **brain** of the inbound pipeline — pure logic, no side effects on `RFPSupplier` (that's F6). A reply is matched via plus-address token, threading headers, or sender email + RFP context, in that priority order.

## Dependencies
- **F4** must be merged: `InboundEmail` rows exist with `rawPayload`, headers, and parsed fields.
- **F3** must be merged (or at least the `replyToken` column populated): primary match path depends on it.
- **F1** schema (already includes `InboundEmail.matchedBy`, `rfpId`, `supplierId`).

## Scope

### In scope
- `apps/email-worker/src/handlers/processInboundReply.ts` — registered as the inbound worker's only handler for `process_inbound` jobs.
- Helper `matchInbound(inboundEmailId): Promise<{ rfpId, supplierId, matchedBy } | null>` containing all four matching strategies in priority order.
- Plus-address parser: `rfp+<replyToken>@reply.yourdomain.com` → token → `RFPSupplier.findUnique({ where: { replyToken } })`.
- `In-Reply-To` / `References` parser: extract `<message-id>` → `EmailMessage.findUnique({ where: { providerMessageId } })` → resolve back to `(rfpId, supplierId)`.
- `from` heuristic: look up `Supplier` by email → if exactly one open RFP for that supplier, match.
- On success: update `InboundEmail` (`status = "matched"`, `rfpId`, `supplierId`, `matchedBy`, `processedAt`).
- On failure: update `InboundEmail` (`status = "unmatched"`, `processedAt`, `errorMessage = reason`). The row stays in the DB for F6 admin review.

### Out of scope (handled elsewhere)
- Updating `RFPSupplier.respondedAt` / status → **F6**.
- Sending a confirmation reply → **F6**.
- Quote extraction → **F8**.
- Manual-match admin endpoints → **F6**.

## Implementation Plan
1. Implement plus-address parser. Use `addrs` lib or manual regex on the local part: `^([a-z0-9]+)\+([A-Za-z0-9_-]+)$`. The first capture group must equal `env.REPLY_ADDRESS_LOCAL_PART`; the second is the token.
2. Implement header normalizer using `mailparser` to parse `In-Reply-To` and `References` from raw headers (handles bracket variants, comma-separated, etc.).
3. Implement `matchByPlusAddress`, `matchByInReplyTo`, `matchByFromEmail` — three pure functions, each returning `{ rfpId, supplierId } | null`.
4. Compose them in `matchInbound` with priority ordering. First non-null wins; record `matchedBy` accordingly.
5. Register handler in `apps/email-worker/src/index.ts` for the inbound worker, replacing the F1 skeleton.
6. Add structured log lines so debugging an unmatched email is trivial: print which strategy was tried and why it failed.

## Files

### To create
- `apps/email-worker/src/handlers/processInboundReply.ts`
- `apps/email-worker/src/matching/plusAddress.ts`
- `apps/email-worker/src/matching/threading.ts`
- `apps/email-worker/src/matching/fromEmail.ts`
- `apps/email-worker/src/matching/index.ts` (`matchInbound` entry point)

### To modify
- `apps/email-worker/src/workers/inboundWorker.ts` — replace skeleton with full impl that calls `processInboundReply`.
- `apps/email-worker/src/index.ts` — wire the new handler.

## DB / Schema Changes
None — F1 already defined `InboundEmail.matchedBy`, `rfpId`, `supplierId`.

State transitions F5 owns:
```
InboundEmail.status: received ──► matched | unmatched | failed
                       (sets rfpId, supplierId, matchedBy, processedAt)
```

`status = "failed"` is reserved for parser-level errors (e.g. malformed payload). Use `unmatched` for "we tried, no candidate."

## Config / Env Vars
Consumes from F1:
- `REPLY_ADDRESS_LOCAL_PART` — to validate the plus-address local part.
- `REPLY_ADDRESS_DOMAIN` — for sanity-checking the recipient domain.

No new vars.

## Packages
- `mailparser` is already installed via F1.

## Contracts Exported

```ts
// apps/email-worker/src/matching/index.ts
export interface MatchResult {
  rfpId: number;
  supplierId: number;
  matchedBy: "plus_address" | "in_reply_to" | "references" | "from_email";
}

export async function matchInbound(
  inboundEmailId: number
): Promise<MatchResult | null>;
```

This function is consumed by F6 (which calls it from the same handler chain).

## Code Sketches

```ts
// apps/email-worker/src/matching/plusAddress.ts
import { env } from "../config/env";
import { prisma } from "../config/db";

const RE = /^([a-z0-9]+)\+([A-Za-z0-9_-]+)@(.+)$/i;

export async function matchByPlusAddress(toEmail: string) {
  const m = toEmail.trim().toLowerCase().match(RE);
  if (!m) return null;
  const [, localBase, token, domain] = m;
  if (localBase !== env.REPLY_ADDRESS_LOCAL_PART.toLowerCase()) return null;
  if (domain !== env.REPLY_ADDRESS_DOMAIN.toLowerCase()) return null;

  const link = await prisma.rFPSupplier.findUnique({
    where: { replyToken: token },
    select: { rfpId: true, supplierId: true },
  });
  return link ?? null;
}
```

```ts
// apps/email-worker/src/matching/threading.ts
import { prisma } from "../config/db";

const ID_RE = /<([^>]+)>/g;

function extractMessageIds(headerVal: string | null): string[] {
  if (!headerVal) return [];
  return [...headerVal.matchAll(ID_RE)].map((m) => m[1]);
}

export async function matchByThreading(args: {
  inReplyTo: string | null;
  references: string | null;
}) {
  const candidates = [
    ...extractMessageIds(args.inReplyTo),
    ...extractMessageIds(args.references).reverse(), // most recent ref last
  ];
  for (const id of candidates) {
    const msg = await prisma.emailMessage.findUnique({
      where: { providerMessageId: id },
      select: { rfpId: true, supplierId: true },
    });
    if (msg?.rfpId && msg.supplierId) {
      return { rfpId: msg.rfpId, supplierId: msg.supplierId };
    }
  }
  return null;
}
```

```ts
// apps/email-worker/src/matching/fromEmail.ts
import { prisma } from "../config/db";

export async function matchByFromEmail(fromEmail: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { email: fromEmail.trim().toLowerCase() },
    select: {
      id: true,
      rfps: {
        where: { status: { in: ["invited", "responded"] } },
        select: { rfpId: true },
      },
    },
  });
  if (!supplier) return null;
  // Only auto-match if exactly one open RFP. Otherwise ambiguous → unmatched.
  if (supplier.rfps.length !== 1) return null;
  return { rfpId: supplier.rfps[0].rfpId, supplierId: supplier.id };
}
```

```ts
// apps/email-worker/src/matching/index.ts
import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { matchByPlusAddress } from "./plusAddress";
import { matchByThreading } from "./threading";
import { matchByFromEmail } from "./fromEmail";

export interface MatchResult {
  rfpId: number;
  supplierId: number;
  matchedBy: "plus_address" | "in_reply_to" | "references" | "from_email";
}

export async function matchInbound(inboundEmailId: number): Promise<MatchResult | null> {
  const inbound = await prisma.inboundEmail.findUniqueOrThrow({
    where: { id: inboundEmailId },
  });

  const plus = await matchByPlusAddress(inbound.toEmail);
  if (plus) return { ...plus, matchedBy: "plus_address" };

  const threaded = await matchByThreading({
    inReplyTo: inbound.inReplyTo,
    references: inbound.references,
  });
  if (threaded) return { ...threaded, matchedBy: "in_reply_to" };

  const fromMatch = await matchByFromEmail(inbound.fromEmail);
  if (fromMatch) return { ...fromMatch, matchedBy: "from_email" };

  logger.warn(
    { inboundEmailId, to: inbound.toEmail, from: inbound.fromEmail },
    "unmatched inbound"
  );
  return null;
}
```

```ts
// apps/email-worker/src/handlers/processInboundReply.ts
import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { matchInbound } from "../matching";

export async function processInboundReply(inboundEmailId: number) {
  const result = await matchInbound(inboundEmailId);
  if (!result) {
    await prisma.inboundEmail.update({
      where: { id: inboundEmailId },
      data: { status: "unmatched", processedAt: new Date() },
    });
    return { matched: false };
  }

  await prisma.inboundEmail.update({
    where: { id: inboundEmailId },
    data: {
      status: "matched",
      rfpId: result.rfpId,
      supplierId: result.supplierId,
      matchedBy: result.matchedBy,
      processedAt: new Date(),
    },
  });

  logger.info({ inboundEmailId, ...result }, "inbound matched");
  // F6 will hook in here — see F6's `markRfpSupplierResponded`.
  return { matched: true, ...result };
}
```

## Testing
Build a fixture suite with at least these cases:
1. **plus-address happy path**: `to: rfp+abc123@reply.yourdomain.com` → matches by `replyToken`.
2. **plus-address with mixed-case token**: token is preserved verbatim (don't lowercase the token portion — it's base64url and case-sensitive).
3. **threading**: `In-Reply-To: <provider-msg-id-from-our-EmailMessage>` → matches.
4. **References fallback**: `In-Reply-To` empty but `References` contains our message-id.
5. **from email + single open RFP**: ambiguous threading but supplier has exactly one open RFP → matches.
6. **from email + multiple open RFPs**: → returns null → `unmatched`.
7. **unknown sender**: `from: random@x.com`, no plus-address, no threading → `unmatched`.
8. **plus-address but token doesn't exist**: → `unmatched` (don't fall through to from-email — that would invite spoofing).

> **Note on case 8**: it's a deliberate design choice. If a reply lands on our reply domain with an invalid token, we treat that as suspicious, not as a fall-back-to-from match. Otherwise an attacker could send `to: rfp+garbage@reply.yourdomain.com` with `from: a-real-supplier@example.com` and confuse the matcher. Document this in code comments.

Aim for ≥95% match rate on a representative fixture set of 100 emails.

## Acceptance Criteria
- [ ] All 8 fixture cases above produce the expected `matchedBy` value.
- [ ] An ambiguous from-email match (multiple open RFPs) → `unmatched`, not a wrong match.
- [ ] An invalid plus-address token → `unmatched`, not a from-email fallback.
- [ ] `InboundEmail.processedAt` set in both matched and unmatched outcomes.
- [ ] Re-running `processInboundReply(id)` on a row that's already `matched` is a no-op (idempotent — see Open Questions).
- [ ] Worker logs include `inboundEmailId`, `matchedBy`, `to`, `from` for every decision (matched and unmatched).

## Open Questions
- [ ] **Idempotency on re-runs:** if BullMQ retries `process_inbound`, should we re-match or no-op? **Recommend no-op when `status` is already `matched`** — re-running matching is unsafe if F6 already did state work. Add a guard at the top of `processInboundReply`.
- [ ] How aggressive is `matchByFromEmail`? Currently requires exactly one open RFP. Alternative: most-recently-invited RFP wins. **Recommend strict "exactly one"** for v1 to avoid silent wrong-matches.
- [ ] Should we also match on `Subject` containing the RFP code as a tertiary fallback? Risk: low precision (suppliers edit subjects). **Recommend no** for v1.
- [ ] When an `unmatched` email later gets manually mapped (F6), do we re-run `processInboundReply`? **Recommend yes** — F6 calls a shared `markRfpSupplierResponded(rfpId, supplierId, inboundEmailId)` directly, bypassing matching.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §9 (Reply Address Strategy / Matching priority).
- Upstream: [F1](./F1-email-infrastructure.md), [F3](./F3-rfp-email-integration.md), [F4](./F4-inbound-email-capture.md).
- Downstream: [F6](./F6-supplier-response-state.md) calls `processInboundReply` and reacts to its result. [F8](./F8-ai-processing.md) hooks in after F6 to enqueue extraction on matched rows.
