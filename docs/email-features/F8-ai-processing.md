# F8 — AI Processing (Deferred / Stub)

## Status
Deferred — stub only   Owner: tbd   Effort: ~1 hour for the stub

## Goal
Reserve a hook in the inbound pipeline for future LLM-based extraction of structured quote data (line items, prices, lead times, remarks) from the supplier's reply body. **No real LLM wiring in this iteration** — define the interface, register a no-op handler, and mark `InboundEmail.extractionStatus` so we can track adoption when the real implementation lands.

## Dependencies
- **F5** must be merged: matched inbound has `rfpId`, `supplierId` populated.
- **F6** must be merged: hook fires after `markRfpSupplierResponded` so all state is settled.
- **F1** schema: `InboundEmail.extractionStatus` field (added in F1's migration set per its Open Questions).

## Scope

### In scope
- A no-op handler `extractQuoteFromInbound(inboundEmailId)` registered in the inbound pipeline.
- A new optional BullMQ queue `email-extraction` (or reuse `email-inbound` with a different `type`) for async extraction runs.
- Update `InboundEmail.extractionStatus` to `"skipped"` after the no-op runs (so we can later filter "haven't run extraction yet").
- Documented interface for the future implementer.
- Feature flag `EMAIL_AI_EXTRACTION_ENABLED` (default `false`) — when false, the hook is bypassed entirely (no row update either).

### Out of scope (this iteration)
- LLM client setup (Anthropic SDK / OpenAI / etc.).
- Prompt engineering.
- Confidence threshold.
- Auto-population of `SupplierLineItemQuote` rows.
- Multi-turn / retrieval-augmented extraction.
- Cost tracking.
- Human-in-the-loop UI.

## Implementation Plan
1. Confirm `InboundEmail.extractionStatus` is in F1's migration. If not, add as a **separate F8 migration** (rare — better to bake it into F1).
2. Add `apps/email-worker/src/handlers/extractQuote.ts` exporting the future-shaped function:
   ```ts
   export async function extractQuoteFromInbound(inboundEmailId: number): Promise<void>;
   ```
   In v1 this just sets `extractionStatus = "skipped"` and logs.
3. Wire the call: at the bottom of `markRfpSupplierResponded` (F6), if `EMAIL_AI_EXTRACTION_ENABLED`, call `extractQuoteFromInbound`. The call itself is fire-and-forget into a queue (don't block the worker).
4. Document the future shape of the contract in this doc and as a TS type so the next implementer can fill in.
5. Add a single integration test: "stubbed extraction runs without changing user-visible behavior."

## Files

### To create
- `apps/email-worker/src/handlers/extractQuote.ts`
- `apps/email-worker/src/types/extraction.ts` (interface for future result)

### To modify (minor)
- `apps/email-worker/src/handlers/markRfpSupplierResponded.ts` (F6) — call extraction at end if flag is on.
- `apps/email-worker/src/index.ts` — register the stub handler.

## DB / Schema Changes
- Field already in F1: `InboundEmail.extractionStatus String?` with values `"pending" | "extracted" | "skipped" | "failed"`.
- (Future) New table `QuoteExtractionRun` to track every attempt with raw LLM output, latency, cost, confidence. **Defer to real implementation.**

## Config / Env Vars
Adds:
```bash
EMAIL_AI_EXTRACTION_ENABLED=false   # turn on to attempt extraction; v1 stub respects but does nothing
ANTHROPIC_API_KEY=                  # placeholder for future use
EMAIL_AI_MODEL=claude-opus-4-7      # placeholder
```

(Listing these in F1's env-var block now is fine — having a placeholder is cheaper than churning `.env.example` later.)

## Packages
None new for the stub. The future implementation will add `@anthropic-ai/sdk`.

## Contracts Exported (future shape)

```ts
// apps/email-worker/src/types/extraction.ts
export interface ExtractedLineItemQuote {
  // Match by line-item index in the RFP, OR by description text similarity.
  lineItemIndex?: number;        // 0-based; position in RFP.lineItems
  lineItemDescription?: string;  // free-text from the email
  unitPrice: number;
  quantity?: number;
  currency?: string;             // ISO 4217, default INR/USD
  leadTimeDays?: number;
  remarks?: string;
}

export interface QuoteExtractionResult {
  lineItemQuotes: ExtractedLineItemQuote[];
  overallRemarks?: string;
  totalPrice?: number;
  confidence: number;            // 0-1
  rawLLMResponse: string;        // for debugging/auditing
  modelUsed: string;             // e.g. "claude-opus-4-7"
  inputTokens: number;
  outputTokens: number;
}

export type ExtractionStatus = "pending" | "extracted" | "skipped" | "failed";
```

## Code Sketches

```ts
// apps/email-worker/src/handlers/extractQuote.ts
import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { env } from "../config/env";

/**
 * v1 stub. Marks the inbound as "skipped" so we can find rows that never
 * got a real extraction attempt when we wire up the LLM later.
 *
 * Future shape:
 *   1. Fetch InboundEmail (body, subject, headers).
 *   2. Fetch RFP + line items for context.
 *   3. Call Claude with a structured-output prompt (tool use / JSON mode).
 *   4. Parse QuoteExtractionResult.
 *   5. If confidence > threshold, upsert SupplierLineItemQuote rows.
 *   6. Update InboundEmail.extractionStatus accordingly.
 */
export async function extractQuoteFromInbound(inboundEmailId: number): Promise<void> {
  if (!env.EMAIL_AI_EXTRACTION_ENABLED) {
    return; // hard off — don't even mark "skipped"
  }

  await prisma.inboundEmail.update({
    where: { id: inboundEmailId },
    data: { extractionStatus: "skipped" },
  });

  logger.info({ inboundEmailId }, "extraction stubbed");
}
```

```ts
// apps/email-worker/src/handlers/markRfpSupplierResponded.ts (excerpt — F6 patch)
import { extractQuoteFromInbound } from "./extractQuote";

// at the end of markRfpSupplierResponded(args):
await extractQuoteFromInbound(args.inboundEmailId);
```

## Testing
- **Unit:**
  - `EMAIL_AI_EXTRACTION_ENABLED=false` → function is a no-op, no DB write.
  - `EMAIL_AI_EXTRACTION_ENABLED=true` → `InboundEmail.extractionStatus = "skipped"`, log line emitted.
- **Integration:**
  - End-to-end inbound flow with extraction stub on → no behavior changes for the user; row's `extractionStatus` reflects state.

## Acceptance Criteria
- [ ] `extractQuoteFromInbound` registered and called at the end of `markRfpSupplierResponded` (when flag is on).
- [ ] No real LLM call is made (stub).
- [ ] With flag on, every matched + responded inbound has `extractionStatus = "skipped"`.
- [ ] Flag off → no DB writes, no log lines about extraction.
- [ ] Future implementer has a clear interface (`QuoteExtractionResult`) and a single function to fill in.

## Open Questions
- [ ] Synchronous vs queued extraction? **Future recommendation: queue it** (LLM calls are slow + retryable). For v1 stub, doesn't matter.
- [ ] When confidence is low, do we **still upsert** quote rows but mark them `needs_review`, or skip entirely? **Defer.**
- [ ] Multi-language emails — Claude handles fine; just document expected behavior.
- [ ] Long replies / multi-message threads — use only the latest reply or the full chain? **Defer.**
- [ ] Should we add a `QuoteExtractionRun` audit table now, even if it's empty? **Defer** — easy to add later, premature now.
- [ ] Cost: at ~1k inbounds/month and Claude pricing, extraction is meaningful but not blocking. Track `inputTokens`/`outputTokens` on the run record when implemented.

## Cross-references
- Implementation reference: [`/docs/email-implementation.md`](../email-implementation.md) §15 (Open Decisions — attachments → quote extraction future state).
- Upstream: [F5](./F5-email-mapping.md), [F6](./F6-supplier-response-state.md).
- Downstream: when implemented, will populate `SupplierLineItemQuote` rows in the existing schema.
