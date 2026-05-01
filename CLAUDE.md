# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

A **B2B RFP (Request For Proposal) Management System**. Users create RFPs from reusable templates, distribute them to suppliers via email, and collect quoted responses per line item. The system tracks the full lifecycle from draft → submission → supplier response.

**Status:** Backend is feature-complete for auth, supplier management, and RFP creation. Frontend is a Vite/React scaffold — not yet implemented.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces (pnpm@10.27.0) |
| Backend | Node.js + Express 4 + TypeScript 5 |
| ORM | Prisma 7 with `@prisma/adapter-pg` (PostgreSQL) |
| Cache / OTP | Redis via ioredis |
| Email | Resend API + `@react-email` templates |
| Frontend | React 19 + Vite 7 (scaffold only) |
| Auth | JWT (access 15m + refresh 7d), httpOnly cookies |

---

## Commands

### Root
```bash
pnpm dev          # Start all services in watch mode
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm clean        # Clean deps and dist
```

### Backend API
```bash
pnpm --filter @apps/api dev              # Start with tsx watch (hot reload)
pnpm --filter @apps/api build            # Compile TypeScript → dist/
pnpm --filter @apps/api start            # Run compiled output
pnpm --filter @apps/api prisma:generate  # Regenerate Prisma client after schema change
pnpm --filter @apps/api prisma:migrate   # Run migrations (dev only)
pnpm --filter @apps/api prisma:studio    # Open Prisma Studio GUI
```

### Frontend
```bash
pnpm --filter @apps/web dev     # Vite dev server
pnpm --filter @apps/web build   # Vite production build
pnpm --filter @apps/web lint    # ESLint
```

**Always use pnpm** — npm/yarn break workspace linking.

---

## Branching Strategy

```
master        → production-ready code; PRs merged here from develop
develop       → integration branch; all feature branches merge here first
feature/<domain>  → short-lived branches for new work (e.g. feature/rfp, feature/auth-api)
```

- **Never commit directly to `master` or `develop`** — always work on a `feature/` branch and open a PR
- Branch off `develop` for new features: `git checkout -b feature/<domain> develop`
- PRs target `develop`; `develop` is merged into `master` for releases
- Branch names use kebab-case: `feature/supplier-listing`, not `feature/supplierListing`
- Keep feature branches short-lived — one domain or one logical chunk of work per branch

---

## Environment Setup

Copy `apps/api/.env.example` to `apps/api/.env` and fill in all values:

```env
NODE_ENV=development
PORT=8080

# PostgreSQL
DATABASE_URL=
POSTGRES_DB=rfp_system
POSTGRES_USER=rfp_db_user
POSTGRES_PASSWORD=rfp@dbpass
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis (use REDIS_URL for cloud, or HOST/PORT for local)
REDIS_URL=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT — must use DIFFERENT secrets for access vs. refresh
JWT_ACCESS_TOKEN_SECRET=your_access_secret_here
JWT_REFRESH_TOKEN_SECRET=your_refresh_secret_here
JWT_ACCESS_TOKEN_EXPIRATION=15m
JWT_REFRESH_TOKEN_EXPIRATION=7d
SALT_ROUNDS=10

# Email (Resend)
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_FROM_NAME=RFP System
EMAIL_ENABLED=true

# CORS
FRONTEND_URL=http://localhost:5173
```

> **Note:** `REDIS_URL` takes precedence over `REDIS_HOST`/`REDIS_PORT` when set.

First-time setup:
```bash
pnpm install
cp apps/api/.env.example apps/api/.env
# fill in .env values
pnpm --filter @apps/api prisma:migrate
pnpm --filter @apps/api prisma:generate
```

---

## Architecture Overview

```
Request → Express middleware stack → Route → Controller → Service → Repository → Prisma → PostgreSQL
                                                                   ↘ Redis (OTP, rate limiting)
                                                                   ↘ Resend (email)
```

### Monorepo Layout
```
apps/api/    → Express + TypeScript backend
apps/web/    → React + Vite frontend (scaffold — not implemented)
packages/    → Shared packages (empty)
```

### Backend Layers (`apps/api/src/`)
```
config/        → Singletons: DB (Prisma), Redis, env validation
middleware/    → authenticate, asyncHandler, errorHandler
routes/        → Express Router definitions only (no logic)
controllers/   → Thin: extract req body/params, call service, send res
service/       → ALL business logic lives here
repositories/  → ALL Prisma queries live here (no logic)
utils/         → Pure helpers: tokens, passwords, OTP, errors, constants
types/         → TypeScript type definitions and Express augmentation
templates/     → React Email TSX templates (compiled to HTML at send time)
```

---

## Key Domain Concepts

### METHODS and ACTIONS — The Validation Control Plane

Every mutating RFP/LineItem request must carry both `method` and `action`. These drive validation behavior.

```typescript
// utils/constant.ts
METHODS = { SUBMIT, SAVE, INVITE, ACCEPT, REJECT }
ACTIONS = { CREATE, EDIT, DElETE, CANCEL }   // ← DElETE has a capital-E typo (value is 'delete')
```

- **`method`** controls **validation strictness**:
  - `SAVE` → skip mandatory field enforcement, save as draft
  - `SUBMIT` → enforce all `mandatory: true` fields
  - `INVITE/ACCEPT/REJECT` → defined but not yet wired to any service

- **`action`** controls **which DB operation to perform**:
  - `CREATE` → insert new record
  - `EDIT` → update existing (requires existing `id`)
  - `DElETE` → soft delete / mark deleted (requires existing `id`)
  - `CANCEL` → defined but not yet wired

> **Critical:** `ACTIONS.DElETE` (capital E) is the correct key. `ACTIONS.DELETE` does NOT exist. Do not rename it without a global search-and-replace across `rfpLineItemService.ts`.

### Status Values (All Plain String Literals — No Enums)

**RFP:**
- `'drafted'` — saved via METHODS.SAVE
- `'submitted'` — created via METHODS.SUBMIT + ACTIONS.CREATE
- `'pending'`, `'in-progress'`, `'completed'`, `'cancelled'` — referenced in guards but transitions not yet implemented

**LineItem:**
- `'pending'` — default on creation
- `'in-progress'`, `'completed'`, `'cancelled'` — blocks deletion if set
- Soft-deleted via `lineItemRepository.markDeleted()` (sets status to `'deleted'`)

**Supplier:**
- `'created'` — set on creation
- `'deleted'` — set on soft delete

**RFPSupplier:**
- `'invited'` — DB default; accept/reject transitions not yet wired

### Template System

Templates define the structure of an RFP. A `Template` has `Section[]`, each Section has `Field[]`.

Section types (`SECTION_TYPES`):
- `'form'` → header fields; responses stored in `RFP.fieldResponses` JSON blob
- `'table'` → line items; each row becomes a `LineItem` DB record

Field types (`FIELD_TYPES`): `text`, `number`, `date`, `boolean`, `select`, `multiselect`, `radio`, `checkbox`, `dataLookup`, `formula`

**`systemKey` on Field** — if a field has `systemKey` set, its value maps to a real DB column (e.g., `systemKey: 'price'` → `LineItem.price`). Fields without `systemKey` go into the `fieldResponses` JSON blob.

### RFP Submission Payload Schema

The `POST /rfp/` endpoint accepts this structure (see `rfpController.ts` for the full documented example):

```typescript
{
  method: 'submit' | 'save',
  action: 'create' | 'edit',
  appId: number,
  template: {
    id: number,
    schema: {
      [sectionKey: string]: {
        // For FORM sections — maps to RFP.fieldResponses
        fieldResponses: {
          [fieldKey: string]: any   // key = field.key from template
        },
        // For TABLE sections — each entry becomes a LineItem
        rowOrder: string[],         // ordered list of row keys
        rows: {
          [rowKey: string]: {
            key: string,
            action: 'create' | 'edit' | 'delete',
            id?: number,            // required for edit/delete
            sno: number,
            status?: string,
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

### App Model (Multi-tenancy)

The `App` model wraps `RFP` and `Template` records for organizational scoping. **Currently not enforced** — `appId` is in the schema and payload but no service filters by it. Do not add `appId` filtering to queries until its intended use is clarified.

---

## Prisma Usage Notes

- **Import from** `'../generated/prisma/client'` (or relative equivalent) — **never from `@prisma/client`**
- Prisma 7 uses `@prisma/adapter-pg` driver adapter — initialized with `new PrismaPg(pool)` in `config/database.ts`
- The singleton client is in `config/database.ts` — never instantiate a second `PrismaClient`
- `RFP` model is accessed as `prisma.rFP` (Prisma camelCases all-caps model names)
- Client is generated to the non-default location: `src/generated/prisma` (configured in `schema.prisma`)

---

## Known Issues and Stubs

| Location | Issue |
|---|---|
| `rfpService.ts:19` | `values.code.splite('/')` — typo, crashes amendment code path |
| `app.ts:38` | RFP routes at `/rfp/` instead of `/api/rfp/` — inconsistent with all other routes |
| `lisitngService.ts` | Filename typo — should be `listingService.ts` |
| `ACTIONS.DElETE` | Capital E typo in key name — do not use `ACTIONS.DELETE` |
| `rfpService.ts` `generateRfpCode` | Empty stub — suppliers created without codes |
| `common.ts` `applyPrecision` | Empty stub — returns `undefined` |
| `userAuth.ts` `userProfile` | TODO placeholder — returns no data |
| `utils/tokenRefresh.ts` | Dead code — unreferenced; `refreshToken` controller uses `utils/tokens.ts` |
| `opt.ts:57` | Typo in error message: "h1 hour" should be "1 hour" |

---

## HOW CLAUDE SHOULD WORK IN THIS CODEBASE

### Where to Implement New Logic

| Type of code | Where it goes |
|---|---|
| DB queries | `repositories/` only |
| Business logic | `service/` only |
| HTTP handling | `controllers/` only (thin layer) |
| Route definitions | `routes/` only |
| Reusable utilities | `utils/` |
| Shared types | `types/` |
| Email templates | `templates/` |

**Never** put Prisma queries in services. **Never** put business logic in controllers or routes.

### How to Add a New Feature (Step-by-Step)

1. **Identify the domain** — does it touch RFP, Supplier, User, Template, or a new domain?
2. **Check the DB schema** — does `schema.prisma` need a new model or field? If yes, add it and run `prisma:migrate` + `prisma:generate`.
3. **Add repository methods** — write the Prisma queries in the relevant `repositories/*.ts` file. Accept an optional `tx?: TransactionClient` if the operation may be part of a transaction.
4. **Add service logic** — write business logic in `service/*.ts`. Call repository methods. Throw typed errors from `utils/errors.ts` for all failure cases.
5. **Add controller** — extract `req.body`/`req.params`/`req.auth`, call the service, return `{ success: true, data: ... }`.
6. **Add route** — register the method + path in the relevant `routes/*.ts` file. Wrap handlers with `asyncHandler`. Prefix with `/api/`.
7. **Wire route in `app.ts`** — add `app.use('/api/<domain>', <domainRoutes>)`.

### Patterns to Follow

- **Errors:** Always throw from `utils/errors.ts` (`ValidationError`, `NotFoundError`, etc.) — never throw plain `Error` or return error objects
- **Async routes:** Always wrap route handlers with `asyncHandler(handler)` — never use try/catch in controllers
- **Transactions:** Use `runInTransaction` from `repositories/transactionRunner.ts` when a service method creates/updates multiple records atomically
- **Response shape:** Always return `{ success: true, data: <payload> }` for success; pagination adds `countData: { pages, limit, totalCount, page }`
- **Auth:** Access `req.auth.userId` and `req.auth.email` in controllers — never read raw token headers
- **Ownership checks:** Always check `auth.userId === record.creatorId` before allowing edit/delete

### What to Avoid

- Do not use `ACTIONS.DELETE` — the constant key is `ACTIONS.DElETE` (typo preserved intentionally until fixed)
- Do not import from `@prisma/client` — import from `'../generated/prisma/client'`
- Do not instantiate a new `PrismaClient` anywhere — use the singleton from `config/database.ts`
- Do not `await` `createSearchString()` in supplier service — it is intentionally fire-and-forget
- Do not add `appId` filtering to queries yet — multi-tenancy not fully specified
- Do not use `utils/tokenRefresh.ts` — it is dead code; use `refreshTokens` from `utils/tokens.ts`

---

## Supporting Documentation

- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — Component responsibilities and data flow
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Folder structure, layers, request lifecycle
- [docs/DB_SCHEMA.md](docs/DB_SCHEMA.md) — All models, relationships, business meaning
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — Naming, error handling, validation patterns
- [docs/FLOWS/authentication-flow.md](docs/FLOWS/authentication-flow.md) — Registration, OTP, login, refresh, password reset
- [docs/FLOWS/rfp-creation-flow.md](docs/FLOWS/rfp-creation-flow.md) — Full RFP lifecycle and payload schema
- [docs/FLOWS/supplier-management-flow.md](docs/FLOWS/supplier-management-flow.md) — Supplier CRUD lifecycle
