# Email Features Index

Living index of the parallelizable feature breakdown. Each feature has a self-contained doc with planning, implementation, schema, config, code sketches, tests, and acceptance criteria. Update only the **Status** column here when a feature ships; all detail edits happen in the per-feature doc.

Cross-cutting reference doc: [`/docs/email-implementation.md`](../email-implementation.md)

## Status board

| # | Feature | Status | Owner | Effort |
|---|---|---|---|---|
| F1 | [Email Infrastructure](./F1-email-infrastructure.md) | Complete | tbd | ½ day |
| F2 | [Outbound Email System](./F2-outbound-email-system.md) | Not started | tbd | 1 day |
| F3 | [RFP Email Integration](./F3-rfp-email-integration.md) | Not started | tbd | 1 day |
| F4 | [Inbound Email Capture](./F4-inbound-email-capture.md) | Not started | tbd | ½ day |
| F5 | [Email Mapping](./F5-email-mapping.md) | Not started | tbd | 1 day |
| F6 | [Supplier Response State](./F6-supplier-response-state.md) | Not started | tbd | ½ day |
| F7 | [Reliability (dedup/retry)](./F7-reliability-dedup-retry.md) | Not started | tbd | 1 day |
| F8 | [AI Processing](./F8-ai-processing.md) | Deferred (stub only) | tbd | 1 hr |

## Dependency graph

```
F1 (Infrastructure) ──┬──▶ F2 (Outbound) ──▶ F3 (RFP Integration) ─┐
                      │                                              │
                      ├──▶ F4 (Inbound Capture) ──▶ F5 (Mapping) ──▶ F6 (Response State) ──▶ F8 (AI, deferred)
                      │
                      └──▶ F7 (Reliability) — cross-cutting
```

**Critical-path:** F1 → F2 → F3 (outbound RFP invitation working).

**Parallel tracks once F1 lands:**
- Track A: F2 → F3
- Track B: F4 → F5 → F6
- Track C: F7 (attaches to F2/F4 as they land)
- Track D: F8 (stub only)

**Key rule:** F1 must merge **all DB migrations and shared TS contracts upfront**, so F2–F7 can be developed against the same shape without merge conflicts.

## Cross-feature integration / end-to-end verification

After all features land, run this scenario:

1. Submit an RFP with two suppliers.
2. Verify two `EmailMessage` rows go `queued → sent` (F1 + F2 + F3).
3. Verify suppliers receive emails with unique `Reply-To` plus-addresses (F3).
4. Reply from supplier A → Mailgun webhook → `InboundEmail` row → matched to supplier A → `RFPSupplier.respondedAt` populated → confirmation email sent back (F4 + F5 + F6).
5. Resend a `delivered` webhook → `EmailMessage.status = "delivered"` (F7).
6. Replay the same Mailgun webhook → no duplicate row (F7).
7. Send a malformed reply (random `from`, no plus-address) → ends up in admin unmatched list (F5 + F6).

## Working notes

- Each feature doc is the **source of truth** for that feature's status. Update its `## Status` line and `## Acceptance Criteria` checklist as work progresses.
- If reality drifts from the cross-cutting reference (`/docs/email-implementation.md`), update **both** docs.
- Keep this README's status table to one line per feature — detail belongs in the feature docs.
