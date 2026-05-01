# RFP Creation Flow

---

## Overview

An RFP is created from a **Template** which defines the structure (sections + fields). The creation payload must conform to the template's schema. Two modes exist:
- **SAVE** (`method: 'save'`) → saves as `drafted` status; mandatory fields not enforced
- **SUBMIT** (`method: 'submit'`) → saves as `submitted` status; all mandatory fields enforced

---

## Endpoint

```
POST /rfp/
```
> **Known bug:** Should be `POST /api/rfp/` — the `/api` prefix is missing in `app.ts`.

Requires: valid `accessToken` cookie or `Authorization: Bearer` header.

---

## Request Payload Schema

```typescript
{
  method: 'submit' | 'save',
  action: 'create' | 'edit',
  appId: number,
  template: {
    id: number,                     // ID of the Template to use
    schema: {
      [sectionKey: string]: {       // key matches Section.key in the template

        // For FORM sections (sectionType = 'form'):
        fieldResponses: {
          [fieldKey: string]: any   // fieldKey = Field.key; value = user input
        },

        // For TABLE sections (sectionType = 'table'):
        rowOrder: string[],         // ordered list of row keys
        rows: {
          [rowKey: string]: {
            key: string,            // same as the rowKey
            action: 'create' | 'edit' | 'delete',
            id?: number,            // required for action='edit' or 'delete'
            sno: number,            // serial number / display order
            status?: string,        // row status
            fieldResponses: {
              [fieldKey: string]: any
            }
          }
        }
      }
    }
  }
}
```

### Example: Two sections (one form, one table)

```json
{
  "method": "submit",
  "action": "create",
  "appId": 1,
  "template": {
    "id": 5,
    "schema": {
      "header": {
        "fieldResponses": {
          "subject": "Office Supplies Q3",
          "deadline": "2025-09-30",
          "notes": "Urgent procurement"
        }
      },
      "items": {
        "rowOrder": ["row_1", "row_2"],
        "rows": {
          "row_1": {
            "key": "row_1",
            "action": "create",
            "sno": 1,
            "fieldResponses": {
              "product": "101",
              "quantity": "50",
              "price": "12.50",
              "description": "A4 Paper"
            }
          },
          "row_2": {
            "key": "row_2",
            "action": "create",
            "sno": 2,
            "fieldResponses": {
              "product": "202",
              "quantity": "10",
              "price": "45.00",
              "description": "Stapler"
            }
          }
        }
      }
    }
  }
}
```

---

## Flow: Create RFP

```
POST /rfp/
  │
  ▼
rfpController.createNew(req, res)
  │  extracts: req.body (full payload), req.auth (userId, email)
  │
  ▼
rfpService.createNew(payload, auth)
  │
  ├─ [Guard] method and action must both be present
  │
  ├─ validateInput(payload, auth)
  │   │
  │   ├─ validateTransactionFromTemplate(payload, auth)
  │   │   │
  │   │   ├─ [Guard] payload.template.id must exist
  │   │   │
  │   │   ├─ templateService.getTemplateForView(templateId, {}, auth)
  │   │   │   → templateRepository.findById() with sections + fields
  │   │   │
  │   │   ├─ Iterate template.sections[]:
  │   │   │   │
  │   │   │   ├─ [Guard] section.key must exist
  │   │   │   │
  │   │   │   ├─ If FORM section:
  │   │   │   │   validateTemplateHeaderDetails({
  │   │   │   │     section, method, action,
  │   │   │   │     fieldResponses: payload.template.schema[section.key].fieldResponses
  │   │   │   │   })
  │   │   │   │   → For each field in section.fieldOrder:
  │   │   │   │       validateFieldResponse({ method, action, fieldResponses }, field)
  │   │   │   │       → if mandatory && SUBMIT && no value → throw ValidationError
  │   │   │   │       → if systemKey='price' && not a number → throw ValidationError
  │   │   │   │       → if systemKey='product' && no value → throw ValidationError
  │   │   │   │       → return { isSystemField, value }
  │   │   │   │       if isSystemField: headerDetails[field.systemKey] = value
  │   │   │   │       else: headerDetails.fieldResponses[field.key] = value
  │   │   │   │
  │   │   │   └─ If TABLE section:
  │   │   │       rfpLineItemService.validateLineItems({
  │   │   │         fields, fieldOrder, method, action,
  │   │   │         rows: payload.template.schema[section.key].rows,
  │   │   │         rowOrder: payload.template.schema[section.key].rowOrder,
  │   │   │       })
  │   │   │       → [Guard] rowOrder must exist and match rows count
  │   │   │       → For each rowKey in rowOrder:
  │   │   │           if action=DELETE: push row.id to deletedItems[]
  │   │   │           if action=CREATE/EDIT:
  │   │   │             for each field: validateFieldResponse() → build row obj
  │   │   │             push to lineItems[]
  │   │   │
  │   │   └─ returns { headerDetails, lineItems }
  │   │
  │   └─ createObj(headerDetails, auth)
  │       → sets: userId, fieldResponses, subject, templateId, active, status
  │       → generateRfpCode() → 'RFP-DRAFT' (SAVE) or 'RFP-' (SUBMIT+CREATE)
  │
  ├─ If SUBMIT + CREATE: headerDetails.status = 'submitted'
  │
  └─ runInTransaction(async (tx) => {
      rfpRepository.create(headerDetails, tx)   → INSERT INTO RFP
      rfpLineItemService.lineItemsUpdate(rfp.id, lineItems, auth, tx)
        → lineItemRepository.createMany(rfp.id, newItems, tx)  → INSERT LineItems
        → lineItemRepository.updateManyInTransaction(updates, tx)
        → lineItemRepository.markDeleted(deletedIds, tx)
    })
```

---

## Flow: List RFPs

```
GET /rfp/?page=1&limit=10&status=submitted&search=office
  │
  ▼
rfpController.getAllRfpForListing(req, res)
  │
  ▼
rfpService.getAllRfpForListing(options, auth)
  │
  ├─ Extract: page, limit, sort, order from options
  ├─ Calculate: skip = (page-1)*limit, take = limit
  │
  ▼
listingService.rfpForListing({ ...options, skip, take }, auth)
  → Prisma query with where/orderBy/skip/take
  → returns { rfps, count }
  │
  ▼
createCommonMetaDataForListing({ count, limit, page })
  → returns { pages, limit, totalCount, page }
  │
  ▼
returns { rfps, countData }
```

---

## Status Lifecycle

```
[drafted]   ← SAVE + CREATE
    │
    ▼
[submitted] ← SUBMIT + CREATE
    │
    ▼
[pending]          ─┐
[in-progress]       ├── Status transitions NOT YET IMPLEMENTED
[completed]         │
[cancelled]        ─┘
```

---

## systemKey Field Routing

Fields with `systemKey` write to real DB columns. Fields without go into the JSON blob.

| `systemKey` value | DB column | Model |
|---|---|---|
| `'price'` | `LineItem.price` | LineItem |
| `'product'` | `LineItem.productId` | LineItem |
| `'code'` | auto-generated | LineItem |
| *(none)* | → `fieldResponses` JSON | RFP or LineItem |

---

## Key Files

| File | Role |
|---|---|
| `routes/rfpRoutes.ts` | Route registration |
| `controllers/rfpController.ts` | HTTP layer |
| `service/rfpService.ts` | Main orchestration + validation |
| `service/rfpLineItemService.ts` | Line item validation + DB operations |
| `service/templateService.ts` | Template fetch |
| `repositories/rfpRepository.ts` | RFP Prisma queries |
| `repositories/lineItemRepository.ts` | LineItem Prisma queries |
| `repositories/transactionRunner.ts` | `runInTransaction` |
| `utils/common.ts` | `validateFieldResponse` |
| `utils/constant.ts` | `METHODS`, `ACTIONS`, `SECTION_TYPES` |

---

## Known Issues in This Flow

| Issue | Location | Impact |
|---|---|---|
| `values.code.splite('/')` typo | `rfpService.ts:19` | Crashes on amendment (SUBMIT+EDIT with existing code) |
| Route at `/rfp/` not `/api/rfp/` | `app.ts:38` | Inconsistent URL, will break frontend API clients |
| `generateRfpCode` returns stub `'RFP-'` | `rfpService.ts:17` | RFP code not properly generated on submit |
| `appId` not populated in `createObj` | `rfpService.ts` | `appId` is required by DB schema but not set in the object — will fail on insert |
