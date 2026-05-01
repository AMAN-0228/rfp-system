# Database Schema

**ORM:** Prisma 7 with `@prisma/adapter-pg` (PostgreSQL)
**Client location:** `apps/api/src/generated/prisma` (non-default)
**Access via:** `prisma` singleton from `config/database.ts`

---

## Entity Overview

```
User
 ├── creates → RFP[]
 └── creates → Supplier[]

App (multi-tenancy container — not yet enforced)
 ├── owns → RFP[]
 └── owns → Template[]

Template
 └── has → Section[]
              └── has → Field[]

RFP
 ├── belongs to → User
 ├── belongs to → App
 ├── built from → Template (id + frozen JSON copy)
 ├── has → LineItem[]
 └── has → RFPSupplier[] (invitations)

Supplier
 ├── belongs to → User (creator)
 ├── invited via → RFPSupplier[]
 └── quotes on → SupplierLineItemQuote[]

LineItem
 ├── belongs to → RFP
 └── has → SupplierLineItemQuote[]

RFPSupplier (join table)
 ├── RFP → Supplier (many-to-many)
 └── tracks invitation status

SupplierLineItemQuote
 ├── Supplier → LineItem (many-to-many)
 └── tracks supplier's price quote
```

---

## Models

### User
Buyer/creator of RFPs. Authentication principal.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `email` | String | UNIQUE | Login identifier |
| `name` | String? | nullable | |
| `password` | String | | bcrypt hash |
| `active` | Boolean | default true | |
| `createdAt` | DateTime | default now | |
| `updatedAt` | DateTime | auto-updated | |

Relations: `suppliers[]`, `rfps[]`

---

### Supplier
A vendor who receives RFPs. Can be registered (has account) or unregistered (email only).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `code` | String | UNIQUE | **Currently: empty stub** — `generateCode()` not implemented |
| `email` | String | UNIQUE | Contact email |
| `name` | String | | Display name |
| `status` | String | | `'created'`, `'deleted'` |
| `active` | Boolean | default true | |
| `isRegistered` | Boolean | default false | true = supplier has login account |
| `creatorId` | Int | FK → User | Owner — controls edit/delete access |
| `searchString` | String | | Concatenated fields for full-text search |
| `createdAt` | DateTime | | |
| `updatedAt` | DateTime | | |

Relations: `creator` (User), `rfps[]` (RFPSupplier[]), `lineItemQuotes[]`

---

### RFP
A Request For Proposal document. Created from a template, distributed to suppliers.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `code` | String | UNIQUE | e.g., `'RFP-DRAFT'` or `'RFP-001'`; amendment adds `/1`, `/2` |
| `active` | Boolean | default true | |
| `status` | String | | See Status Values below |
| `searchString` | String | | Full-text search index |
| `subject` | String | | RFP title/subject |
| `fieldResponses` | Json | default `{}` | Form section field values (non-system fields) |
| `userId` | Int | FK → User | Creator |
| `templateId` | Int | FK (logical) | Template used; not a hard FK in schema |
| `appId` | Int | FK → App | Multi-tenancy scope (not enforced yet) |
| `template` | Json | default `{}` | Frozen template snapshot at time of creation |
| `createdAt` | DateTime | | |
| `updatedAt` | DateTime | | |

**Status Values:**
- `'drafted'` — saved via METHODS.SAVE; not submitted
- `'submitted'` — submitted via METHODS.SUBMIT + ACTIONS.CREATE
- `'pending'`, `'in-progress'`, `'completed'`, `'cancelled'` — lifecycle states (transitions not yet implemented)

Relations: `user` (User), `lineItems[]`, `suppliers[]` (RFPSupplier[]), `app` (App)

> **Note:** `prisma.rFP` (camelCase of `RFP` model name) is how Prisma exposes this model.

---

### LineItem
A single item within an RFP that suppliers quote on.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `sno` | Int | | Serial number / display order |
| `status` | String | | `'pending'`, `'in-progress'`, `'completed'`, `'cancelled'`; soft-deleted = status `'deleted'` |
| `fieldResponses` | Json | default `{}` | Non-system field values |
| `quantity` | Int | | Item quantity |
| `price` | Decimal | Decimal(12,2) | Unit price |
| `productId` | Int | | Product reference (no FK constraint in schema) |
| `rfpId` | Int | FK → RFP | Parent RFP |
| `createdAt` | DateTime | | |
| `updatedAt` | DateTime | | |

**Deletion:** Soft-deleted via `markDeleted()` — sets status to `'deleted'`.
**Guard:** Cannot delete if status is `'in-progress'`, `'completed'`, or `'cancelled'`.

Relations: `rfp` (RFP), `quotes[]` (SupplierLineItemQuote[])

---

### Template
A reusable RFP structure definition. Has version control support.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK, autoincrement | |
| `status` | String | | Template lifecycle status |
| `parentTemplateId` | Int? | nullable | Points to parent for versioning |
| `version` | Int | | Version number |
| `active` | Boolean | default true | |
| `label` | String | | Display name |
| `config` | Json | | Template-level configuration |
| `appId` | Int | FK → App | Multi-tenancy scope |
| `createdAt` | DateTime | | |
| `updatedAt` | DateTime | | |

Relations: `sections[]`, `app` (App)

---

### Section
A section within a Template. Organizes fields by purpose.

| Column | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `label` | String | Display name |
| `templateId` | Int | FK → Template |
| `active` | Boolean | default true |
| `sectiontype` | String | `'form'` or `'table'` |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Section Types:**
- `'form'` — header fields; responses stored in `RFP.fieldResponses`
- `'table'` — line items; each row creates a `LineItem` record

Relations: `template` (Template), `fields[]`

---

### Field
An individual field within a Section.

| Column | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `label` | String | Display label |
| `sectionId` | Int | FK → Section |
| `active` | Boolean | default true |
| `systemKey` | String | If set, maps to a real DB column (e.g., `'price'`, `'product'`, `'code'`) |
| `mandatory` | Boolean | default false; enforced on METHODS.SUBMIT |
| `key` | String | Field identifier used in `fieldResponses` JSON keys |
| `type` | String | `text`, `number`, `date`, `boolean`, `select`, `multiselect`, `radio`, `checkbox`, `dataLookup`, `formula` |
| `sectiontype` | String | Mirrors parent section type |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**`systemKey` significance:** Fields with `systemKey` values write directly to DB columns. Fields without go into the JSON `fieldResponses` blob. The `validateFieldResponse()` function in `utils/common.ts` returns `{ isSystemField, value }` to route the value appropriately.

---

### RFPSupplier
Join table tracking which suppliers are invited to which RFPs.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK | |
| `rfpId` | Int | FK → RFP | |
| `supplierId` | Int | FK → Supplier | |
| `status` | String | default `'invited'` | `'invited'`; accept/reject not yet wired |
| `invitedAt` | DateTime | default now | |
| `respondedAt` | DateTime? | nullable | Set when supplier responds |

Unique constraint: `(rfpId, supplierId)` — a supplier can only be invited once per RFP.
Indexes: on `supplierId`, on `rfpId`.

---

### SupplierLineItemQuote
A supplier's price quote for a specific line item.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | Int | PK | |
| `supplierId` | Int | FK → Supplier | |
| `lineItemId` | Int | FK → LineItem | |
| `price` | Decimal | Decimal(12,2) | Quoted unit price |
| `remarks` | String? | nullable | Supplier notes |
| `submittedAt` | DateTime | default now | |
| `fieldResponses` | Json | default `{}` | Additional field responses |

Unique constraint: `(supplierId, lineItemId)` — one quote per supplier per item.

---

### App
Multi-tenancy container. Groups RFPs and Templates by organization.

| Column | Type | Notes |
|---|---|---|
| `id` | Int | PK |
| `label` | String | Organization name |
| `config` | Json | default `{}` |

> **Status:** `appId` exists on RFP and Template but is not currently enforced/filtered in any service query.

---

## Key Constraints Summary

| Constraint | Models | Type |
|---|---|---|
| One supplier invited once per RFP | RFPSupplier | UNIQUE(rfpId, supplierId) |
| One quote per supplier per item | SupplierLineItemQuote | UNIQUE(supplierId, lineItemId) |
| Unique supplier email | Supplier | UNIQUE(email) |
| Unique supplier code | Supplier | UNIQUE(code) |
| Unique RFP code | RFP | UNIQUE(code) |
| Unique user email | User | UNIQUE(email) |

---

## JSON Columns

Three models use `Json` columns for flexible field storage:

| Model | Column | Contains |
|---|---|---|
| `RFP` | `fieldResponses` | Form section non-system field values |
| `RFP` | `template` | Frozen snapshot of template at creation time |
| `LineItem` | `fieldResponses` | Table section non-system field values per row |
| `SupplierLineItemQuote` | `fieldResponses` | Supplier's additional field responses |
| `Template` | `config` | Template-level configuration object |
| `App` | `config` | Organization configuration |
