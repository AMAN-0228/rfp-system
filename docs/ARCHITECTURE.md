# Architecture

## Folder Structure

```
rfp-system/                         # Monorepo root
├── CLAUDE.md                       # AI guidance (entry point)
├── README.md                       # Project overview
├── package.json                    # Root workspace scripts
├── pnpm-workspace.yaml             # Defines: apps/* and packages/*
├── docs/                           # All architecture documentation
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md             # ← this file
│   ├── DB_SCHEMA.md
│   ├── CONVENTIONS.md
│   └── FLOWS/
│       ├── authentication-flow.md
│       ├── rfp-creation-flow.md
│       └── supplier-management-flow.md
│
├── apps/
│   ├── api/                        # Backend service
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry: init DB, Redis, start Express
│   │   │   ├── app.ts              # Express setup: middleware stack, route wiring
│   │   │   ├── config/             # DB, Redis, env singletons
│   │   │   ├── middleware/         # authenticate, asyncHandler, errorHandler
│   │   │   ├── routes/             # Express Router definitions
│   │   │   ├── controllers/        # HTTP layer (extract req, call service, send res)
│   │   │   ├── service/            # Business logic
│   │   │   │   └── email/          # Resend email service
│   │   │   ├── repositories/       # Prisma data access layer
│   │   │   ├── utils/              # Pure helpers, constants, error classes
│   │   │   ├── types/              # TypeScript types + Express augmentation
│   │   │   ├── templates/          # React Email TSX templates
│   │   │   └── generated/
│   │   │       └── prisma/         # Auto-generated Prisma client (do not edit)
│   │   ├── prisma/
│   │   │   └── schema.prisma       # Database schema (source of truth)
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── ts.config.json
│   │
│   └── web/                        # Frontend (scaffold only)
│       ├── src/
│       │   ├── main.jsx            # React entry point
│       │   └── App.jsx             # Default Vite placeholder
│       ├── vite.config.js
│       └── package.json
│
└── packages/                       # Shared packages (empty — reserved)
```

---

## Layer Separation

The backend follows a strict 4-layer architecture. Data flows in one direction: **Controller → Service → Repository → Database**.

```
┌─────────────────────────────────────────────┐
│                  HTTP Layer                  │
│  routes/ → middleware/ → controllers/        │
│  • Route registration                        │
│  • Auth + error middleware                   │
│  • Extract req data, return res              │
└──────────────────┬──────────────────────────┘
                   │ calls
┌──────────────────▼──────────────────────────┐
│               Service Layer                  │
│  service/                                    │
│  • All business logic                        │
│  • Validation, permission checks             │
│  • Orchestrates repositories                 │
│  • Throws typed errors                       │
└──────────────────┬──────────────────────────┘
                   │ calls
┌──────────────────▼──────────────────────────┐
│             Repository Layer                 │
│  repositories/                               │
│  • Raw Prisma queries only                   │
│  • No business logic                         │
│  • Accept optional TransactionClient         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Data Layer                      │
│  PostgreSQL (via Prisma) + Redis             │
└─────────────────────────────────────────────┘
```

### Rules
- Controllers call services, never repositories directly
- Services call repositories, never Prisma directly
- Repositories never contain business logic
- `utils/` functions are pure helpers — no DB/Redis calls (except `common.ts` which is transitional)

---

## Request Lifecycle

```
Incoming HTTP request
        │
        ▼
[helmet]            — security headers
[cors]              — CORS allow-list from FRONTEND_URL
[cookieParser]      — parses Cookie header into req.cookies
[express.json()]    — parses JSON body
        │
        ▼
[Route matching]
        ├─ GET /api/health             → inline handler (no auth)
        ├─ /api/no-auth/user/*         → no auth required
        ├─ POST /api/auth/refresh      → no auth required (placed before authenticate)
        │
        ▼
[authenticate middleware]             — all routes below require valid token
        │   extracts JWT from Bearer header OR accessToken cookie
        │   attaches TokenPayload to req.auth
        ▼
        ├─ /api/auth/*                 → authRoutes
        ├─ /api/supplier/*             → supplierRoutes
        └─ /rfp/*                      → rfpRoutes   ← BUG: should be /api/rfp/
                │
                ▼
        [asyncHandler(controller)]     — wraps async fn, catches rejections
                │
                ▼
        [Controller]                   — extract data, call service
                │
                ▼
        [Service]                      — business logic
                │
                ▼
        [Repository]                   — Prisma query
                │
                ▼
        [errorHandler middleware]      — catches any thrown error
                │                        maps ApiError → HTTP response
                ▼
        HTTP Response
```

---

## Design Patterns

### Singleton Config
`config/database.ts` and `config/redis.ts` export singleton instances. All modules import from these — no new connections created elsewhere.

### Repository Pattern with Optional Transaction Client
```typescript
// Repository signature
async function create(data: any, tx?: TransactionClient) {
  const client = tx ?? prisma;  // use tx if inside a transaction
  return client.rFP.create({ data });
}

// Service usage
await runInTransaction(async (tx) => {
  const rfp = await rfpRepository.create(headerDetails, tx);
  await lineItemRepository.createMany(rfp.id, rows, tx);
});
```

### Custom Error Hierarchy
```typescript
ApiError (base)
  ├── ValidationError    (400) — bad input
  ├── BadRequestError    (400) — malformed request
  ├── UnauthorizedError  (401) — missing/invalid token
  ├── ForbiddenError     (403) — insufficient permission
  ├── NotFoundError      (404) — resource doesn't exist
  ├── ConflictError      (409) — duplicate resource
  ├── InternalServerError (500) — unexpected
  └── DbError            (500) — database failure
```

The global `errorHandler` middleware catches any thrown `ApiError` and maps it to the correct HTTP status code and JSON body.

### asyncHandler Wrapper
Every route handler is wrapped in `asyncHandler()` which catches rejected promises and forwards them to `next(error)`. This means controllers and services can throw errors freely without try/catch.

```typescript
// routes/supplierRoutes.ts
router.get('/', asyncHandler(getAllSuppliers));
```

### OTP Rate Limiting (Redis)
Four Redis keys per email address manage the OTP lifecycle:
```
otp:{email}               → the OTP value (TTL: 60s)
otp:{email}_attempts      → send attempt count (TTL: 5min)
otp:{email}_block         → send block flag (TTL: 15min)
otp:{email}_wrong_attempts → wrong verification count (TTL: 2min, block TTL: 1hr)
```

---

## Express Middleware Order in `app.ts`

The ordering matters — particularly that `POST /api/auth/refresh` must be registered **before** the `authenticate` middleware, since refreshing a token requires no valid access token.

```typescript
app.use(helmet());
app.use(cors(...));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', ...);            // public
app.use('/api/no-auth/user', ...);      // public
app.post('/api/auth/refresh', ...);     // public — MUST be before authenticate

app.use(authenticate);                  // ← all routes below require valid token

app.use('/api/auth', authRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/rfp', rfpRoutes);             // ← BUG: should be /api/rfp

app.use(notFoundHandler);
app.use(errorHandler);
```

---

## TypeScript Configuration

- Target: `ES2020`
- Module: `ESNext` with `moduleResolution: bundler`
- Strict mode enabled
- Source: `src/`, output: `dist/`
- Dev runtime: `tsx watch src/index.ts` (no compile step in development)
