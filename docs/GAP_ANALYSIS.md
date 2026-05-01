# System Gap Analysis — RFP Management System

**Reviewer:** Senior Staff Engineer  
**Date:** 2026-05-01  
**Branch:** `develop`

---

## Table of Contents

1. [Current System Summary](#1-current-system-summary)
2. [Missing Features](#2-missing-features)
3. [Partial Implementations](#3-partial-implementations)
4. [Incorrect Design Choices](#4-incorrect-design-choices)
5. [Data Model Gaps](#5-data-model-gaps)
6. [Flow Breakages](#6-flow-breakages)
7. [Reliability Issues](#7-reliability-issues)
8. [Scalability Concerns](#8-scalability-concerns)
9. [Observability Gaps](#9-observability-gaps)
10. [Architecture Improvements](#10-architecture-improvements)
11. [Data Model Review and Recommendations](#11-data-model-review-and-recommendations)
12. [Flow Recommendations](#12-flow-recommendations)
13. [Risk Analysis](#13-risk-analysis)
14. [Prioritized Action Plan](#14-prioritized-action-plan)

---

## 1. Current System Summary

### What Is Built and Working

- Full auth lifecycle: registration (OTP via Redis), login (JWT, httpOnly cookies), token refresh, logout, password reset
- Supplier CRUD: create, edit, soft-delete, toggle active, paginated list with search
- RFP creation: SAVE (draft) and SUBMIT paths, template validation, line-item transactions via Prisma
- Email infrastructure: Resend provider with `sendEmailWithRetry()` (3 retries), React Email templates, email singleton
- Prisma 7 + PostgreSQL with proper repository/service layering
- Redis for OTP storage and rate-limiting

### Core Architectural Shape

```
Request → authenticate middleware → Controller → Service → Repository → Prisma → PostgreSQL
                                                         ↘ Redis (OTP, rate limiting)
                                                         ↘ Resend (email — partial)
```

Email and Redis hang off the Service layer. There is no queue, no worker, and no background job system.

### What the Product Requires (but Does Not Exist)

| Required Capability | Status |
|---|---|
| Send RFP emails to suppliers on submission | Not wired |
| Track per-supplier email delivery status | Missing |
| Inbound email response ingestion | Missing entirely |
| Supplier response data model | Missing entirely |
| AI extraction of structured data from responses | Missing entirely |
| RFP/supplier/response status lifecycle | Partially modeled, not enforced |
| Background job queue | Missing entirely |

---

## 2. Missing Features

### 2.1 Email Sending Not Triggered on RFP Creation

`emailService.sendRfpToSuppliers()` exists as a method signature but **is never called** from `rfpService.createNew()`. Submitting an RFP sends zero emails.

**Evidence:** `rfpService.ts` → `runInTransaction()` creates RFP + LineItems, then returns. No email call follows anywhere in the function.

There is also no RFP invitation email template — only `OtpTemplate` exists under `templates/`.

### 2.2 Supplier Response Ingestion — Completely Absent

There is no mechanism for receiving supplier responses. The product intent requires:

- An inbound email webhook (or polling loop) to receive email replies
- Parsing of the inbound email to extract RFP + supplier identity
- Storage of the raw unstructured response (text, attachments, or mixed)

None of this exists. `sendSupplierResponseNotification()` and `sendResponseConfirmed()` in `emailService.ts` hint at intent but there is no inbound path at all.

### 2.3 AI Extraction Pipeline — Completely Absent

No AI integration exists anywhere in the codebase. There is no service, no queue entry, no data model for tracking AI job state, and no storage for structured extraction output beyond `SupplierLineItemQuote` (which requires pre-structured input).

### 2.4 Response Data Model — Missing Entity

There is no `SupplierResponse` (or equivalent) model in `schema.prisma`. The only quote-related model is `SupplierLineItemQuote`, which requires pre-structured data (`price`, `lineItemId`). It cannot store:

- Raw email text or HTML
- Attachments
- Unstructured content
- AI processing state
- Response provenance (which email thread, received timestamp)

### 2.5 Email Delivery Tracking — Not Wired

`sendEmailWithRetry()` catches errors internally but **does not write status back to any table**. After 3 retries fail, the failure is silently discarded. No `RFPSupplier` row is updated, no RFP status changes, and no alert is raised.

---

## 3. Partial Implementations

### 3.1 `RFPSupplier` — Schema Exists, Flow Not Wired

The `RFPSupplier` join table (`rfpId`, `supplierId`, `status`, `invitedAt`, `respondedAt`) is the correct structural anchor for per-supplier state. However:

- No rows are ever created in `RFPSupplier` during RFP submission — `rfpRepository.create()` does not include a supplier `createMany`
- `status` is DB-default `'invited'` with no enforced enum — any string can be written
- `invitedAt` and `respondedAt` are never populated
- There is no route or service method to add or remove suppliers from an existing RFP

### 3.2 `emailService.sendRfpToSuppliers()` — Stub Method

The method exists and `sendEmailWithRetry()` is available, but:

- There is no RFP invitation email template (only OTP template exists)
- The method is never called from any service
- It does not accept a supplier list or provide a per-supplier tracking callback

### 3.3 RFP Status Lifecycle — Partially Modeled, Not Enforced

Product intent requires statuses: `created → sending → sent → failed → partial`.

Current status values referenced in code: `drafted`, `submitted`, `pending`, `in-progress`, `completed`, `cancelled`.

None of the delivery-related statuses exist. All status transitions beyond create are marked as "not yet implemented" in the documentation.

### 3.4 `generateRfpCode()` — Returns Stub String

Returns `'RFP-DRAFT'` for save and `'RFP-'` for submit. The submitted RFP code is an incomplete prefix. Since `RFP.code` has a `@unique` constraint, submitting two RFPs will throw a Prisma unique-constraint error (`P2002`) and return a 500.

### 3.5 `generateCode()` for Supplier — Empty Stub

`Supplier.code` is `@unique` and `NOT NULL`, but `generateCode()` returns nothing. Supplier creation will fail at the DB layer unless the caller provides a code externally, which the current flow does not do.

### 3.6 RFP Edit Flow — Not Implemented

`rfpService.edit()` is an empty function body. The `POST /rfp/` route with `action: 'edit'` routes to it, but calling it does nothing and returns no error. Edits are silently dropped.

---

## 4. Incorrect Design Choices

### 4.1 Synchronous Email Sending in the HTTP Request Path

`emailProvider.sendEmail()` is called inline during the HTTP request lifecycle. For an RFP sent to 20 suppliers, this means 20 sequential Resend API calls before the request can return. This will:

- Cause HTTP timeouts for supplier lists larger than ~5
- Block the Node.js event loop thread
- Provide no partial failure recovery — if call #7 fails, calls 1–6 already sent and calls 8+ were never attempted, leaving the state inconsistent

**Correct design:** RFP creation should enqueue a job and return immediately. A background worker sends emails and updates `RFPSupplier.deliveryStatus` per result.

### 4.2 No Idempotency on Email Sending

If the email-send worker crashes after partial completion and retries, there is no guard preventing double-sends to suppliers who already received the email. `RFPSupplier` has no `sentAt` or `deliveryStatus` field to check before sending.

### 4.3 No Correlation Token Between Outbound Email and Inbound Reply

For response ingestion to work, outbound emails must carry a trackable identifier that survives the email reply chain. For example, a custom `Reply-To` address such as `rfp+{rfpId}-{hash(supplierId)}@inbound.yourdomain.com`. There is currently no mechanism for this. Even if inbound emails were received, there is no reliable way to map them to the correct `RFP` and `Supplier` — `from` address matching is not reliable (suppliers use different devices, aliases, etc.).

### 4.4 Route Path Inconsistency

RFP routes are registered at `/rfp/` in `app.ts` instead of `/api/rfp/`. All other routes use the `/api/` prefix. This breaks REST convention uniformity and makes it easy to misconfigure auth middleware scope.

**File:** `apps/api/src/app.ts`

### 4.5 Dead Code: `utils/tokenRefresh.ts`

`utils/tokenRefresh.ts` is an unreferenced duplicate of logic already in `utils/tokens.ts`. It is never imported anywhere. Its presence creates confusion about which file is the canonical token utility.

---

## 5. Data Model Gaps

### 5.1 Schema vs. Requirements Comparison

| Required Entity / Field | Current State | Gap |
|---|---|---|
| `SupplierResponse` model | Missing entirely | Cannot store raw inbound emails or AI processing state |
| `RFPSupplier.deliveryStatus` | Has `status` (plain string, default `'invited'`) | No delivery-specific states; no enum enforcement |
| `RFPSupplier.sentAt` | Missing | No timestamp for when email was sent |
| `RFPSupplier.failureReason` | Missing | No way to surface send errors |
| `RFPSupplier.retryCount` | Missing | No retry tracking |
| `RFP.status` values | `drafted`, `submitted`, `pending`, `in-progress`, `completed`, `cancelled` | Missing `sending`, `sent`, `failed`, `partial` |
| Email delivery log | Missing | No audit trail of send attempts |
| AI job tracking | Missing | No model to track extraction lifecycle |

### 5.2 Recommended Schema Additions

**New model — `SupplierResponse`:**

```prisma
model SupplierResponse {
  id              Int          @id @default(autoincrement())
  rfpSupplierId   Int
  rfpSupplier     RFPSupplier  @relation(fields: [rfpSupplierId], references: [id])
  rawBody         String
  rawAttachments  Json?
  source          String       @default("email")  // 'email' | 'manual'
  status          String       @default("received") // received | processing | processed | failed
  receivedAt      DateTime     @default(now())
  processedAt     DateTime?
  extractedData   Json?
  errorMessage    String?
  emailMessageId  String?      @unique  // for deduplication
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}
```

**Additions to `RFPSupplier`:**

```prisma
deliveryStatus  String    @default("pending")  // pending | sending | sent | failed
sentAt          DateTime?
failureReason   String?
retryCount      Int       @default(0)
```

**Relationship addition to `RFPSupplier`:**

```prisma
responses       SupplierResponse[]
```

---

## 6. Flow Breakages

### 6.1 RFP Creation Flow

```
Current:
  POST /rfp/ → validate → create RFP + LineItems in TX → return 200
  (no RFPSupplier rows created, no emails sent, no status updates)

Required:
  POST /rfp/ → validate → runInTransaction():
                             rfpRepository.create()
                             lineItemRepository.createMany()
                             rfpSupplierRepository.createMany()  ← missing
             → enqueue EmailJob { rfpId, supplierIds }           ← missing
             → return 200

  EmailWorker:
    pop job → for each supplier:
                sendEmailWithRetry()
                on success: RFPSupplier.deliveryStatus = 'sent', sentAt = now()
                on failure: deliveryStatus = 'failed', failureReason = error.message
    aggregate results → update RFP.status:
                all sent    → 'sent'
                some failed → 'partial'
                all failed  → 'failed'
```

### 6.2 Response Ingestion Flow

```
Required (entirely absent):
  Inbound email → webhook POST /api/webhook/inbound-email
               → verify webhook signature
               → parse from, subject, body, attachments
               → extract correlation token from To address
               → look up RFPSupplier by token
               → create SupplierResponse record
               → enqueue AiJob { supplierResponseId }
               → return 200 (webhook must get 200 or it retries)
```

### 6.3 AI Processing Flow

```
Required (entirely absent):
  AiWorker:
    pop AiJob → fetch SupplierResponse.rawBody + attachments
             → build extraction prompt from RFP template field list
             → call AI service
             → on success:
                 write extractedData JSON to SupplierResponse
                 create/update SupplierLineItemQuote rows
                 set SupplierResponse.status = 'processed'
             → on failure:
                 set status = 'failed', store errorMessage
                 retry up to N times
```

---

## 7. Reliability Issues

| Issue | Severity | Detail |
|---|---|---|
| No email idempotency guard | High | Retry after crash can double-send to already-delivered suppliers |
| No transactional email state | High | Email sent successfully but DB update fails leaves `RFPSupplier` stale |
| Silent retry exhaustion | High | `sendEmailWithRetry` swallows all errors after 3 retries; no DB update, no alert |
| No webhook signature verification | High | Inbound email webhook will be unauthenticated without explicit implementation |
| Duplicate inbound email processing | Medium | No `messageId` deduplication guard in response ingestion |
| `createSearchString()` is fire-and-forget | Low | Search index can lag behind actual data; errors are silently lost |
| Stateless JWT logout | Low | Tokens are not blacklisted on logout; only cookies are cleared; valid tokens remain usable until expiry |

---

## 8. Scalability Concerns

| Concern | Detail |
|---|---|
| Synchronous multi-supplier email | O(n) sequential Resend API calls in HTTP request thread; times out at ~5+ suppliers |
| No job queue infrastructure | Email sending and AI processing must be async; requires BullMQ or equivalent |
| Inbound email polling | Polling does not scale; webhook + queue pattern required |
| AI processing latency | LLM calls take 1–30s; must be fully async with status polling or WebSocket push |
| No pagination on per-RFP supplier delivery status | When an RFP has 100 suppliers, there is no endpoint to page through their delivery state |

---

## 9. Observability Gaps

| Gap | Impact |
|---|---|
| No structured request logging | Debugging email failures or ingestion errors requires log searching across raw stdout |
| No delivery status API endpoint | Operators and the UI cannot query per-supplier send state |
| No response status API endpoint | No way to know whether a specific supplier has responded |
| No AI job status API endpoint | Frontend cannot poll or display extraction progress |
| Email send errors silently discarded | Impossible to identify which suppliers never received the RFP |
| OTP error message typo: `"h1 hour"` | Surfaces incorrectly in UI; signals low test coverage on error paths |

---

## 10. Architecture Improvements

### Current Architecture

```
HTTP Request → Controller → Service → Repository → Prisma
                         ↘ emailService (synchronous, inline)
```

### Recommended Architecture

```
HTTP Request → Controller → Service → Repository → Prisma
                                    → enqueue(EmailJob)      ─┐
                                    → enqueue(AiJob)          │
                                                              ▼
                                            Redis (BullMQ queues)
                                                    │
                      ┌─────────────────────────────┤
                      ▼                             ▼
               EmailWorker                    AiWorker
               ─────────────                  ─────────
               sendEmailWithRetry()           fetch SupplierResponse
               update RFPSupplier             call AI service
               update RFP.status              write extractedData
                                              update SupplierLineItemQuote

Inbound Path:
  Resend webhook → POST /api/webhook/inbound-email
                 → parse + correlate
                 → create SupplierResponse
                 → enqueue(AiJob)
```

**Why BullMQ:** Redis is already deployed and configured in `config/redis.ts`. BullMQ uses Redis natively — zero additional infrastructure required. It provides built-in retry strategies, exponential backoff, job state visibility, and dead-letter queues.

---

## 11. Data Model Review and Recommendations

### What Is Structurally Correct

- `RFPSupplier` join table is the correct anchor point — extend it rather than replace it
- `SupplierLineItemQuote` is correctly positioned as the final structured quote destination after AI extraction writes to it
- `LineItem` → `SupplierLineItemQuote` relationship is architecturally sound
- `RFP.template` JSON snapshot is correct for preserving historical template fidelity

### What Needs to Change

**Add `SupplierResponse` model** (see Section 5.2 for full schema)

**Extend `RFPSupplier`:**
```prisma
deliveryStatus  String    @default("pending")
sentAt          DateTime?
failureReason   String?
retryCount      Int       @default(0)
responses       SupplierResponse[]
```

**Extend `RFP.status` accepted values** (code-level, not schema enum):
```
Add: 'sending' | 'sent' | 'partial' | 'failed'
Keep: 'drafted' | 'submitted' | 'pending' | 'in-progress' | 'completed' | 'cancelled'
```

---

## 12. Flow Recommendations

### 12.1 RFP Creation (Revised)

1. `POST /api/rfp/` validates input and calls `runInTransaction()`:
   - `rfpRepository.create()`
   - `lineItemRepository.createMany()`
   - `rfpSupplierRepository.createMany()` — one row per `supplierId` in the request payload
2. After transaction commits, enqueue `EmailJob { rfpId, supplierIds }` to BullMQ
3. Set `RFP.status = 'sending'`
4. Return `{ success: true, data: { rfpId } }` immediately
5. `EmailWorker` processes job asynchronously (see below)

### 12.2 Email Sending (Revised)

- Outbound RFP emails must include a correlation token in `Reply-To`:  
  `Reply-To: rfp+{rfpId}-{hmac(supplierId, secret)}@inbound.yourdomain.com`
- Per supplier in `EmailWorker`:
  - Call `sendEmailWithRetry()`
  - On success: `RFPSupplier.deliveryStatus = 'sent'`, `sentAt = now()`
  - On retry exhaustion: `deliveryStatus = 'failed'`, `failureReason = error.message`
- After all suppliers processed, compute aggregate and update `RFP.status`:
  - All sent → `'sent'`
  - Some failed → `'partial'`
  - All failed → `'failed'`

### 12.3 Response Ingestion (New)

1. Configure inbound email routing (Resend Inbound, Mailgun, or Postmark) to `POST /api/webhook/inbound-email`
2. Webhook handler:
   - Verify provider signature
   - Parse `from`, `subject`, `body`, `attachments`, `messageId`
   - Extract correlation token from `To` address
   - Look up `RFPSupplier` by decoded `rfpId` + `supplierId`
   - Deduplicate on `emailMessageId` — skip if `SupplierResponse` with same ID already exists
   - Create `SupplierResponse { rawBody, rawAttachments, status: 'received' }`
   - Enqueue `AiJob { supplierResponseId }`
3. Respond `200 OK` immediately

### 12.4 AI Processing (New)

1. `AiWorker` dequeues job, fetches `SupplierResponse` + associated `RFP` template
2. Builds extraction prompt from the RFP's field list (`systemKey` fields as targets)
3. Calls AI service with raw body + attachment text
4. On success:
   - Write `extractedData` JSON to `SupplierResponse`
   - Create or update `SupplierLineItemQuote` rows from extracted values
   - Set `SupplierResponse.status = 'processed'`, `processedAt = now()`
5. On failure:
   - Set `status = 'failed'`, store `errorMessage`
   - Retry up to configured limit; after exhaustion, flag for manual review

---

## 13. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double email send after crash | High | Medium | Check `RFPSupplier.deliveryStatus != 'sent'` before each send attempt |
| `generateRfpCode()` collision crash | High | High | Fix stub to use DB sequence or `{prefix}-{timestamp}-{random}` |
| Supplier code uniqueness crash | High | High | Fix `generateCode()` stub before any supplier creation in staging/prod |
| Silent email failure with no trace | High | High | Write failure details to `RFPSupplier`; expose via delivery status API |
| Wrong supplier mapped to inbound response | Medium | High | Use HMAC-signed correlation token; do not rely solely on `from` address |
| AI extraction on malformed or empty input | Medium | Medium | Always store raw body regardless of extraction result; validate AI output schema |
| Inbound webhook replay causing duplicate responses | Medium | Medium | Deduplicate on `emailMessageId` with `@unique` constraint |
| `rfpService.ts:19` `splite` typo crash | High | Medium | Typo in `.splite('/')` crashes the RFP edit/amendment code path immediately |
| `appId` null on RFP create | High | Medium | Schema column exists but `createObj()` never sets it; will fail when multi-tenancy is enforced |

---

## 14. Prioritized Action Plan

### High Priority — Must Fix Before Production

| # | Action | File / Location | Reason |
|---|---|---|---|
| 1 | Fix `generateRfpCode()` | `service/rfpService.ts` | Returns `'RFP-'`; second submitted RFP crashes on `@unique` constraint |
| 2 | Fix `generateCode()` for Supplier | `service/supplierService.ts` | Empty stub; `Supplier.code` is `@unique NOT NULL`; creation is broken |
| 3 | Fix `splite` typo | `service/rfpService.ts:19` | `.splite('/')` is not a function; crashes the edit/amendment path |
| 4 | Fix RFP route prefix | `app.ts` | Register at `/api/rfp/` not `/rfp/` for consistency and correct auth middleware scope |
| 5 | Create `RFPSupplier` rows on RFP submission | `service/rfpService.ts`, `rfpRepository.ts` | Join table exists but is never populated; supplier–RFP link is structurally missing |
| 6 | Call `emailService.sendRfpToSuppliers()` on submit | `service/rfpService.ts` | Emails are never sent; core product feature is entirely absent |
| 7 | Write email send result to `RFPSupplier` | `emailService.ts`, `schema.prisma` | Add `deliveryStatus`, `sentAt`, `failureReason`; update after each send attempt |

### Medium Priority — Required for Product Completeness

| # | Action | Detail |
|---|---|---|
| 8 | Add `SupplierResponse` model | New Prisma model for raw inbound email storage (see Section 5.2) |
| 9 | Add inbound email webhook endpoint | `POST /api/webhook/inbound-email` with signature verification and correlation token parsing |
| 10 | Add email correlation token to outbound emails | Signed token in `Reply-To` address enabling reliable inbound-to-RFP mapping |
| 11 | Add BullMQ for email and AI jobs | Redis already deployed; decouples email sending from HTTP request and enables reliable retry |
| 12 | Extend `RFP.status` lifecycle values | Add `sending`, `sent`, `partial`, `failed` with guarded transitions in `rfpService.ts` |
| 13 | Add delivery status API endpoint | `GET /api/rfp/:rfpId/delivery-status` returning per-supplier send state |
| 14 | Implement RFP edit flow | `rfpService.edit()` is an empty function body; editing an RFP silently does nothing |

### Low Priority — Quality and Correctness

| # | Action | Detail |
|---|---|---|
| 15 | Delete `utils/tokenRefresh.ts` | Dead code; unreferenced duplicate of `utils/tokens.ts` |
| 16 | Fix `opt.ts:57` typo | `"h1 hour"` → `"1 hour"` in OTP error message |
| 17 | Rename `lisitngService.ts` | Filename typo; rename to `listingService.ts` and update all imports |
| 18 | Add AI extraction worker | After `SupplierResponse` ingestion is working, wire AI service to extract structured quotes into `SupplierLineItemQuote` |
| 19 | Populate `appId` in RFP `createObj()` | Schema column exists; `createObj()` never sets it; will fail when multi-tenancy is enforced |
| 20 | Implement `userProfile` endpoint | `controllers/userAuth.ts` → `userProfile()` is a TODO placeholder returning no data |

---

## Summary

The current backend is a **well-structured foundation** with solid auth, supplier CRUD, RFP creation, and strong architectural discipline (controller/service/repository separation, typed errors, Prisma transactions). However, it is approximately **40% complete** relative to the full product intent.

The two largest missing subsystems — **inbound response ingestion** and **AI extraction** — have zero code and require both new infrastructure (inbound email webhook, background job queue) and new data models. Several critical bugs (`generateRfpCode`, `generateCode`, `splite` typo) will cause hard crashes in production before any advanced features become relevant.

**Recommended next steps in order:**

1. Fix the three crash-causing bugs
2. Wire `RFPSupplier` row creation and email send on RFP submission  
3. Add `deliveryStatus` tracking to `RFPSupplier`
4. Add `SupplierResponse` model to schema
5. Build inbound webhook with correlation token
6. Add BullMQ workers for email and AI processing
