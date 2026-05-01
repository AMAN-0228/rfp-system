# Conventions

Inferred from the existing codebase. Follow these patterns when adding new features.

---

## Backend Architecture Conventions

### Layer Rules (strict)

| Layer | File | Rule |
|---|---|---|
| Route | `routes/*.ts` | Register method + path + `asyncHandler(handler)` only |
| Controller | `controllers/*.ts` | Extract from req, call 1 service function, send res |
| Service | `service/*.ts` | All logic here; call repositories; throw errors |
| Repository | `repositories/*.ts` | Prisma queries only; no logic |

**Never cross layers:** controllers do not import from repositories; services do not send HTTP responses.

### Response Format

All success responses use this shape:
```typescript
res.status(200).json({ success: true, data: <payload> });
res.status(201).json({ success: true, message: 'Resource created' });
```

Listing responses always include pagination metadata:
```typescript
{
  success: true,
  data: {
    items: [...],
    countData: {
      pages: number,
      limit: number,
      totalCount: number,
      page: number,
    }
  }
}
```

`createCommonMetaDataForListing({ count, limit, page })` in `utils/common.ts` generates the `countData` object.

---

## Error Handling

### Always throw typed errors from `utils/errors.ts`

```typescript
// Good
throw new ValidationError('Email is required');
throw new NotFoundError('Supplier not found');
throw new ForbiddenError('You are not authorized');
throw new ConflictError('Email already exists');

// Bad — never do this
throw new Error('something went wrong');
res.status(400).json({ error: '...' });
```

### Error class → HTTP status mapping
| Class | Status |
|---|---|
| `ValidationError` | 400 |
| `BadRequestError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `InternalServerError` | 500 |
| `DbError` | 500 |

### Prisma errors are auto-converted
The `errorHandler` middleware converts:
- `P2002` (unique constraint violation) → `409 Conflict`
- `P2025` (record not found) → `404 Not Found`

You do not need to catch these in repositories or services.

### Never use try/catch in controllers
`asyncHandler` propagates all rejections to the error handler. Controllers should be clean:

```typescript
export const createSupplier = async (req: Request, res: Response) => {
  const supplier = await supplierService.create(req.body, req.auth);
  res.status(201).json({ success: true, data: supplier });
};
// asyncHandler wraps this in routes: asyncHandler(createSupplier)
```

---

## Authentication

### Accessing the authenticated user
```typescript
// In controllers — req.auth is typed as TokenPayload | undefined
const userId = req.auth!.userId;   // safe after authenticate middleware
const email = req.auth!.email;

// Type definition in types/express.d.ts
interface TokenPayload {
  userId: number;
  email: string;
}
```

### Ownership checks in services
```typescript
// Pattern used in supplierService.ts
const accessCheckForAction = (action: Action, creatorId: number, auth: TokenPayload) => {
  if (['edit', 'delete'].includes(action) && auth.userId !== creatorId) {
    throw new ForbiddenError('You are not authorized to perform this action');
  }
};
```

Always verify ownership before mutating a resource the user doesn't own.

---

## Prisma / Repository Conventions

### Import path
```typescript
// Always import from the generated path — never from @prisma/client
import prisma from '../config/database';
import type { TransactionClient } from './types';
```

### Always accept an optional transaction client
```typescript
export const create = async (data: any, tx?: TransactionClient) => {
  const client = tx ?? prisma;
  return client.rFP.create({ data });
};
```

### Model name casing
Prisma camelCases all-caps model names:
- `RFP` model → `prisma.rFP`
- `App` model → `prisma.app`
- `User` → `prisma.user`
- `Supplier` → `prisma.supplier`

### Use `runInTransaction` for multi-step atomic operations
```typescript
import { runInTransaction } from '../repositories/transactionRunner';

await runInTransaction(async (tx) => {
  const rfp = await rfpRepository.create(data, tx);
  await lineItemRepository.createMany(rfp.id, items, tx);
});
```

---

## Validation Conventions

### Input validation pattern
Services validate inputs at the start of each exported function:
```typescript
export const create = async (payload: any, auth: TokenPayload) => {
  if (!payload.email) throw new ValidationError('Email is required');
  
  const emailResult = regxcheck(payload.email, 'email');
  if (!emailResult.isValid) throw new ValidationError(emailResult.errorMsg);
  
  // proceed with business logic
};
```

### `validateFieldResponse` — field routing
This utility in `utils/common.ts` does two things:
1. Validates the field value (mandatory enforcement, type checks)
2. Returns `{ isSystemField, value }` to route the value to the right column

```typescript
const { isSystemField, value } = validateFieldResponse({ method, action, fieldResponses }, field);
if (isSystemField) {
  obj[field.systemKey] = value;   // goes to a real DB column
} else {
  obj.fieldResponses[field.key] = value;  // goes into JSON blob
}
```

### Regex validation
Only email and password have regex validators (defined in `REGEX_MAPPING`):
```typescript
regxcheck(value, 'email');     // uses REGEX_MAPPING.email
regxcheck(value, 'password');  // uses REGEX_MAPPING.password
```

---

## Naming Conventions

### Files
- Services: `<domain>Service.ts` (e.g., `supplierService.ts`)
- Repositories: `<domain>Repository.ts` (e.g., `supplierRepository.ts`)
- Routes: `<domain>Routes.ts` (e.g., `supplierRoutes.ts`)
- Controllers: `<domain>Controller.ts` or `<domain>Auth.ts` for auth

### Functions
- Service exports: descriptive verb phrases (`create`, `edit`, `deleteSupplier`, `getAllSuppliersForListing`)
- Repository functions: query-descriptive (`findFirst`, `findUnique`, `findManyByRfpId`, `updateSearchString`, `markDeleted`)
- Controllers: `<verb><Entity>` (`createSupplier`, `getAllSuppliers`, `getSupplierById`)

### Route paths
All routes use `/api/<domain>/` prefix. Example:
```
GET    /api/supplier/
POST   /api/supplier/
GET    /api/supplier/:supplierId
POST   /api/supplier/:supplierId/edit
POST   /api/supplier/:supplierId/active-inactive
DELETE /api/supplier/:supplierId
```

> **Note:** RFP routes currently use `/rfp/` (missing `/api` prefix) — this is a known bug.

### HTTP methods
Current codebase uses `POST` for edit and status-toggle operations (instead of `PUT`/`PATCH`). Follow this pattern for consistency until an API redesign is done:
```
POST /:id/edit           → edit operation
POST /:id/active-inactive → toggle status
DELETE /:id              → soft delete
```

---

## Constants Usage

From `utils/constant.ts`:

```typescript
// Always use constants, never string literals for these
METHODS.SUBMIT / METHODS.SAVE   // not 'submit' / 'save'
ACTIONS.CREATE / ACTIONS.EDIT   // not 'create' / 'edit'
ACTIONS.DElETE                  // ← capital E typo; do NOT use ACTIONS.DELETE
SECTION_TYPES.FORM              // not 'form'
SECTION_TYPES.TABLE             // not 'table'
FIELD_TYPES.TEXT                // not 'text'
```

> **Inconsistency:** `supplierService.ts` uses string literals (`'create'`, `'edit'`, `'delete'`) instead of `ACTIONS` constants. New code should use `ACTIONS` constants.

---

## Listing / Pagination Pattern

Standard listing function structure:
```typescript
export const getAllXForListing = async (options: any, auth: TokenPayload) => {
  const { page = 1, limit = 10, order = 'desc' } = options;
  const skip = (page - 1) * limit;
  const take = limit;

  const { items, count } = await listingService.xListingData({
    ...options, skip, take, order,
  }, auth);

  return {
    items,
    countData: createCommonMetaDataForListing({ count, limit, page }),
  };
};
```

---

## Email Conventions

- Email is sent via `emailService` singleton — import from `service/email/emailService.ts`
- Email is controlled by `EMAIL_ENABLED` env var
- New email types require:
  1. A new TSX template in `templates/`
  2. A new method on `EmailService` in `emailService.ts`
  3. A new `send*` method on `emailProvider.ts`

---

## OTP Flow Conventions

OTP keys in Redis follow this naming convention for a given `email`:
```
otp:{email}                 → OTP value (TTL: 60s)
otp:{email}_attempts        → send attempt count (TTL: 5min, max 3 before 15min block)
otp:{email}_block           → send block flag (TTL: 15min)
otp:{email}_wrong_attempts  → wrong verify count (TTL: 2min, max 3 before 1hr block)
```

Always use `redisService` methods (not raw `redisClient`) to interact with OTP keys.

---

## Inconsistencies to Be Aware Of

| Pattern | Inconsistency |
|---|---|
| Action naming | `supplierService.ts` uses strings `'create'`/`'edit'`/`'delete'`; `rfpLineItemService.ts` uses `ACTIONS` constants |
| HTTP methods | Edit/toggle use `POST` instead of `PUT`/`PATCH` |
| Route prefix | All routes use `/api/` except RFP (`/rfp/`) |
| Token retrieval | `refreshToken` accepts token from body OR cookies; `authenticate` accepts from Bearer header OR cookies |
