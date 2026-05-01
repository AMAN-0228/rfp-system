# Project Context

## What the System Does

The RFP System is a B2B procurement platform. A **User** (buyer) creates a **Request For Proposal** from a reusable **Template**, then distributes it to one or more **Suppliers** via email. Suppliers submit quotes per **LineItem**. The system tracks the full lifecycle from draft to completion.

---

## Component Responsibilities

### `apps/api` — Backend

#### `config/`
Bootstraps all singletons at startup. These are imported everywhere in the application.

| File | Responsibility |
|---|---|
| `env.ts` | Loads `.env`, validates required vars, exports typed `env` object with defaults |
| `database.ts` | Creates PostgreSQL connection pool (via `pg`) and Prisma client (via `@prisma/adapter-pg`). Exports singleton `prisma` |
| `redis.ts` | Creates ioredis singleton. Supports both `REDIS_URL` (cloud) and `REDIS_HOST`/`REDIS_PORT` (local). `REDIS_URL` takes precedence |

#### `middleware/`

| File | Responsibility |
|---|---|
| `auth.ts` | Extracts JWT from `Authorization: Bearer <token>` header OR `accessToken` cookie; verifies it; attaches decoded payload to `req.auth` |
| `asyncHandler.ts` | Wraps async route handlers to forward any rejected promise to Express error handler |
| `errorHandler.ts` | Global error handler: maps `ApiError` subclasses to HTTP responses; converts Prisma errors (P2002 → 409 Conflict, P2025 → 404 Not Found) |

#### `routes/`
Pure route registration. No logic. Each file creates an Express Router and registers method + path + handler.

#### `controllers/`
Thin HTTP adapters. Responsibilities:
1. Extract data from `req.body`, `req.params`, `req.query`, `req.auth`
2. Call the corresponding service function
3. Return standardized JSON response

No business logic. No direct Prisma calls.

#### `service/`
All business logic lives here.

| File | Responsibility |
|---|---|
| `rfpService.ts` | RFP creation, validation against template, status assignment, orchestrates line items via transaction |
| `rfpLineItemService.ts` | LineItem validation (per-row), create/update/soft-delete operations |
| `supplierService.ts` | Supplier CRUD with ownership checks, email uniqueness, search string management |
| `templateService.ts` | Template retrieval and structure validation |
| `lisitngService.ts` | *(typo — should be `listingService.ts`)* Shared listing queries for RFPs and Suppliers with filtering/pagination |
| `redisService.ts` | Wrapper around Redis for OTP key operations (get, set, delete, check attempts, block) |
| `email/emailService.ts` | Singleton email coordinator. Routes to `emailProvider.ts`. Controlled by `EMAIL_ENABLED` env var |
| `email/emailProvider.ts` | Resend API integration. Renders React Email templates to HTML |

#### `repositories/`
All Prisma queries live here. No business logic.

| File | Responsibility |
|---|---|
| `userRepository.ts` | User CRUD |
| `supplierRepository.ts` | Supplier CRUD + `updateSearchString` (concatenates fields for full-text search) |
| `rfpRepository.ts` | RFP CRUD |
| `lineItemRepository.ts` | LineItem create, findMany, updateMany (in transaction), markDeleted |
| `templateRepository.ts` | Template + Section + Field fetch with nested relations |
| `transactionRunner.ts` | Exports `runInTransaction(callback)` — passes a Prisma transaction client to the callback |
| `types.ts` | Exports `TransactionClient` type (Prisma transaction client) |
| `index.ts` | Re-exports all repository modules |

Every repository method accepts an optional `tx?: TransactionClient` parameter. When provided, it uses the transaction client instead of the global prisma singleton.

#### `utils/`

| File | Responsibility |
|---|---|
| `errors.ts` | Custom error class hierarchy: `ApiError` → `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `InternalServerError`, `BadRequestError`, `DbError` |
| `constant.ts` | All system constants: `METHODS`, `ACTIONS`, `SECTION_TYPES`, `FIELD_TYPES`, `TEMPLATE_TYPES`, `REGEX_MAPPING`, `modelMapping` |
| `tokens.ts` | JWT sign/verify for access and refresh tokens. Exports `TokenPayload` type |
| `tokenRefresh.ts` | **Dead code** — unused duplicate of token refresh logic in `tokens.ts` |
| `auth.ts` | Login logic: email lookup, bcrypt comparison, token generation |
| `password.ts` | Password hash, forgot-password OTP flow, reset-password logic |
| `opt.ts` | OTP send (with rate limiting) and verify (with wrong-attempt blocking) |
| `registration.ts` | User registration flow: validate → send OTP → create pending user |
| `common.ts` | Shared utilities: `validateFieldResponse`, `createCommonMetaDataForListing`, `regxcheck`, `deepCopy`, `applyPrecision` (stub), `markActiveAndInactive` |

#### `templates/`
React Email TSX components rendered to HTML at send time.

| File | Template |
|---|---|
| `otpTemplate.tsx` | OTP verification email |

#### `types/`

| File | Content |
|---|---|
| `express.d.ts` | Augments Express `Request` with `auth?: TokenPayload` — enables `req.auth` throughout the app |
| `templates.ts` | TypeScript interfaces for `Template`, `Section`, `Field` matching Prisma schema shape |

---

## Data Flow

### Registration + OTP
```
POST /api/no-auth/user/register
  → register() [utils/registration.ts]
  → validate input
  → sendOtp() [utils/opt.ts]
    → check Redis block/rate limit keys
    → generate 4-digit OTP
    → emailService.sendOtp() → Resend API
    → store OTP in Redis (60s TTL)
  → return 201

POST /api/no-auth/user/verify-otp-for-registration
  → verifyingOtpForRegistration()
  → verifyOtp() — check Redis
  → userRepository.create()
```

### Login + Token Lifecycle
```
POST /api/no-auth/user/login
  → login() [utils/auth.ts]
  → userRepository.findByEmail()
  → bcrypt.compare()
  → signAccessToken() + signRefreshToken()
  → Set httpOnly cookies: accessToken (15m) + refreshToken (7d)

POST /api/auth/refresh (NO auth middleware — placed before authenticate)
  → refreshToken from body OR cookies
  → refreshTokens() — verify refresh JWT → issue new pair
  → Set new cookies

POST /api/auth/logout
  → clearCookie('accessToken') + clearCookie('refreshToken')
```

### Protected Request Flow
```
Request with accessToken cookie (or Bearer header)
  → authenticate middleware
    → extract token from header OR cookie (header takes priority)
    → verifyAccessToken()
    → attach TokenPayload to req.auth
  → Controller → Service → Repository → Prisma
```

### RFP Creation
```
POST /rfp/   ← NOTE: missing /api prefix (known bug)
  → rfpController.createNew()
  → rfpService.createNew()
    → validateInput()
      → templateService.getTemplateForView() — fetch template + sections + fields
      → iterate sections:
        - FORM sections → validateTemplateHeaderDetails() → build headerDetails object
        - TABLE sections → rfpLineItemService.validateLineItems() → build rows array
      → createObj() — build RFP DB record shape
    → runInTransaction():
      → rfpRepository.create() — insert RFP
      → rfpLineItemService.lineItemsUpdate() — insert/update/delete line items
```

### Supplier Listing
```
GET /api/supplier/
  → supplierController.getAllSuppliers()
  → supplierService.getAllSuppliersForListing()
  → listingService.supplierListingData()
  → supplierRepository (Prisma query with where/skip/take/orderBy)
  → return { suppliers, countData }
```

---

## External Integrations

| Integration | Purpose | Config |
|---|---|---|
| **Resend** | Transactional email (OTP, RFP notifications) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` |
| **PostgreSQL** | Primary data store | `DATABASE_URL` or `POSTGRES_*` vars |
| **Redis** | OTP storage, rate limiting, session keys | `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` |

---

## Assumptions / Uncertainties

- **`App` model:** Intended for multi-tenancy (scoping RFPs/Templates per organization) but `appId` is not currently filtered in any query. The intended setup flow is unclear.
- **Supplier registration flow:** `utils/registration.ts` has a TODO for supplier registration — currently only user registration is implemented.
- **Supplier `code` field:** The `generateCode` function is an empty stub. The `Supplier.code` column is `@unique` — creating suppliers without a code will eventually cause DB failures.
- **RFP amendments:** `generateRfpCode` references `values.code.splite('/')` (typo + logic) for amendment versioning — this feature path is broken.
- **Frontend:** `apps/web/` is a Vite+React scaffold with no implemented UI. The API is designed as a JSON REST API ready for any frontend.
