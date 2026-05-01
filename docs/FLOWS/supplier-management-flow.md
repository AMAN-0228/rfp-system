# Supplier Management Flow

---

## Overview

Suppliers are vendors who receive RFPs. A logged-in User creates and manages suppliers. All operations are ownership-gated — only the creator can edit or delete a supplier.

Suppliers are **soft-deleted** (status set to `'deleted'`, `active` set to `false`) — never hard-deleted.

---

## Endpoints

All require valid `accessToken` cookie or `Authorization: Bearer` header.

```
GET    /api/supplier/                         → list suppliers (paginated)
POST   /api/supplier/                         → create supplier
GET    /api/supplier/:supplierId              → get single supplier
POST   /api/supplier/:supplierId/edit         → update supplier
POST   /api/supplier/:supplierId/active-inactive → toggle active status
DELETE /api/supplier/:supplierId              → soft delete
```

---

## Flow: Create Supplier

```
POST /api/supplier/
  { name, email, action: 'create' }
  │
  ▼
supplierController.createSupplier(req, res)
  │
  ▼
supplierService.create(payload, auth)
  │
  ├─ validateSupplierDataForCreateAndEdit(payload, 'create')
  │   ├─ [Guard] email must exist
  │   └─ regxcheck(email, 'email') → validate email format
  │
  ├─ createObj(payload, auth.userId)
  │   → builds: { name, email, creatorId: userId, status: 'created' }
  │   NOTE: code is NOT set — generateCode() is an empty stub
  │
  ├─ supplierRepository.findFirst({ where: { email } })
  │   → throw ConflictError if email already exists
  │
  ├─ supplierRepository.create({ data: obj })
  │   → INSERT INTO Supplier
  │
  └─ createSearchString(supplier.id)   ← fire-and-forget (no await)
      → supplierRepository.updateSearchString(id)
      → concatenates supplier fields into searchString column
```

> **Known issue:** `generateCode()` is empty — `Supplier.code` is `@unique NOT NULL` in schema. This will cause a DB constraint failure unless the column accepts empty string.

---

## Flow: Edit Supplier

```
POST /api/supplier/:supplierId/edit
  { id, email, name, code, action: 'edit' }
  │
  ▼
supplierService.edit(payload, auth)
  │
  ├─ validateSupplierDataForCreateAndEdit(payload, 'edit')
  │   ├─ [Guard] id and code must exist
  │   └─ regxcheck(email, 'email')
  │
  ├─ createObj(payload, auth.userId)
  │   → builds: { id, name, email }
  │
  ├─ supplierRepository.findUnique({ where: { id, email } })
  │   → throw NotFoundError if not found (validates email matches id)
  │
  ├─ accessCheckForAction('edit', supplier.creatorId, auth)
  │   → throw ForbiddenError if auth.userId !== supplier.creatorId
  │
  ├─ supplierRepository.update({ where: { id }, data: obj })
  │
  └─ createSearchString(updatedSupplier.id)   ← fire-and-forget
```

---

## Flow: Delete Supplier (Soft Delete)

```
DELETE /api/supplier/:supplierId
  │
  ▼
supplierService.deleteSupplier(id, auth)
  │
  ├─ [Guard] id must exist
  │
  ├─ supplierRepository.findUnique({
  │     where: { id, status: { not: 'deleted' } }
  │   })
  │   → throw NotFoundError if not found or already deleted
  │
  ├─ accessCheckForAction('delete', supplier.creatorId, auth)
  │   → throw ForbiddenError if auth.userId !== supplier.creatorId
  │
  └─ supplierRepository.update({
        where: { id },
        data: { active: false, status: 'deleted' }
      })
```

---

## Flow: Toggle Active/Inactive

```
POST /api/supplier/:supplierId/active-inactive
  { id, active: true|false, userType: 'supplier' }
  │
  ▼
supplierController → markActiveAndInactive()  [utils/common.ts]
  │
  ├─ [Guard] id, active, userType must exist
  └─ supplierRepository.update({ where: { id }, data: { active } })
```

Note: This utility supports both `'user'` and `'supplier'` userType — it's a shared function in `utils/common.ts`, not `supplierService.ts`.

---

## Flow: List Suppliers

```
GET /api/supplier/?page=1&limit=10&search=acme&order=desc
  │
  ▼
supplierService.getAllSuppliersForListing(options, auth)
  │
  ├─ Extract: page, limit, search, order; calculate skip/take
  │
  ▼
listingService.supplierListingData({ ...options, skip, take, search, order }, auth)
  → Prisma query:
    where: { status: { not: 'deleted' }, searchString: { contains: search } }
    orderBy: { createdAt: order }
    skip / take for pagination
  → returns { suppliers, count }
  │
  ▼
createCommonMetaDataForListing({ count, limit, page })
  │
  ▼
returns { suppliers, countData }
```

---

## Flow: View Single Supplier

```
GET /api/supplier/:supplierId
  │
  ▼
supplierService.getSupplierForView(id, auth)
  │
  ├─ [Guard] id must exist
  │
  └─ supplierRepository.findUnique({
        where: { id },
        include: { creator: { select: { id, name } } }
      })
      → throw NotFoundError if not found
```

---

## Search String

Each supplier has a `searchString` column used for full-text search. It is built by concatenating supplier fields (name, email, etc.) via `supplierRepository.updateSearchString(id)`.

This is called **without `await`** after create and edit — it is intentionally fire-and-forget:
```typescript
createSearchString(supplier.id); // no await — best-effort, does not block response
```

---

## Ownership Model

```
Supplier.creatorId === User.id (the logged-in user who created the supplier)

Allowed for ANY authenticated user:
  - GET list
  - GET single

Allowed ONLY for creator:
  - POST edit
  - DELETE
```

The check is in `accessCheckForAction()` in `supplierService.ts`:
```typescript
if (['edit', 'delete'].includes(action) && auth.userId !== creatorId) {
  throw new ForbiddenError('You are not authorized to perform this action');
}
```

---

## Key Files

| File | Role |
|---|---|
| `routes/supplierRoutes.ts` | Route registration |
| `controllers/supplierController.ts` | HTTP layer |
| `service/supplierService.ts` | Business logic, ownership checks |
| `service/lisitngService.ts` | Listing query (typo in filename) |
| `repositories/supplierRepository.ts` | Prisma queries + updateSearchString |
| `utils/common.ts` | `markActiveAndInactive`, `regxcheck` |

---

## Known Issues

| Issue | Location | Impact |
|---|---|---|
| `generateCode()` is empty stub | `supplierService.ts:8` | `Supplier.code` will be `undefined` — may crash on DB insert |
| String literals instead of `ACTIONS` constants | `supplierService.ts` | Minor inconsistency vs. rest of codebase |
| `createSearchString` called without await | `supplierService.ts:84,110` | Best-effort — search index may lag briefly after create/edit |
