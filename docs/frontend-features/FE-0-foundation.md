# FE-0 — Foundation

## Status
Not started   Owner: tbd   Effort: ~2 days

## Goal
Land the foundational frontend plumbing every other slice depends on: TanStack Router file-based routing, TanStack Query client, ky HTTP client with a single-flight 401-refresh interceptor, Zustand auth store, shadcn/ui design system primitives, Tailwind, RHF + Zod wiring, env config, an `openapi-typescript`-generated types module, and the centralised `endpoints.ts` + `qk` (query-key factory). Once FE-0 merges, FE-1 through FE-15 can be developed in parallel against stable contracts.

## Dependencies
None. FE-0 is the foundation. FE-1–FE-15 all import from FE-0.

## Scope

### In scope
- Vite + React 19 + TypeScript already scaffolded — extend, do not replace.
- Tailwind CSS 4 set up; `tailwind.config.ts`; CSS variables for theme tokens.
- `shadcn/ui` initialised; copy in primitives: Button, Input, Form, Label, Table, Dialog, Sheet, Toast (sonner), Select, Skeleton, Badge, Tabs, DropdownMenu, Pagination, Card, Separator.
- TanStack Router file-based with route groups: `_authed/` (guarded layout) and `_public/` (no auth, no chrome). Root + 404 + error boundaries.
- TanStack Query `QueryClient` with sensible defaults (`staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false` for v1).
- ky instance at `lib/api.ts` with `prefixUrl: env.VITE_API_BASE_URL`, `credentials: 'include'`, JSON content-type, response hook that unwraps `{ success, data }`, error hook that throws typed `ApiError`.
- **Single-flight 401 refresh interceptor** — on 401, exactly one in-flight refresh; concurrent 401s wait on the same promise; on success retry original; on failure clear auth and redirect to `/login`.
- Zustand `authStore` with `{ userId, email, isAuthenticated, hydrated }` and actions `setSession`, `clear`, `markHydrated`.
- `lib/endpoints.ts` — single source for every API path. Isolates the `/rfp/` vs `/api/rfp/` bug to one line per `CLAUDE.md` known issues.
- `lib/queryKeys.ts` — `qk` factory; **every key nests under `appId`** (multi-tenancy plan-ahead).
- `types/api.gen.ts` — `openapi-typescript` output, OR a hand-typed shim covering the documented response envelope + the domain types listed in `docs/DB_SCHEMA.md` until the backend ships an OpenAPI doc.
- Toast system wired (sonner) with helpers for success/error.
- Error boundary at the route root.
- App shell composition primitives (just bare scaffolding — actual shell content lives in FE-4).
- `vitest` + `@testing-library/react` + `msw` set up; one passing smoke test covers the api client + envelope unwrap.

### Out of scope (handled elsewhere)
- Login/register/forgot-password forms → **FE-1**, **FE-2**, **FE-3**.
- Authenticated layout chrome (sidebar, top bar, dashboard cards) → **FE-4**.
- Any feature page → its own slice.
- E2E framework (Playwright) — recommend but defer concrete config until first feature lands.
- CI workflows for the web app.

## Implementation Plan
1. Add Tailwind 4 + PostCSS to `apps/web`. Confirm `pnpm --filter @apps/web dev` renders Tailwind classes.
2. Init shadcn/ui (`npx shadcn init`); copy in the primitives listed above.
3. Install `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `ky`, `sonner`, `lucide-react`, `date-fns`, `openapi-typescript` (devDep).
4. Wire Vite plugin for TanStack Router; create `src/routes/__root.tsx`, `src/routes/_authed/_layout.tsx`, `src/routes/_public/_layout.tsx`. Index route redirects to `/dashboard` when authed, `/login` when not.
5. Create `src/config/env.ts` reading `VITE_API_BASE_URL`, `VITE_FRONTEND_URL`, `VITE_DEFAULT_APP_ID` (placeholder until multi-tenancy is wired).
6. Create `src/lib/endpoints.ts` listing every documented path. Group by domain (auth, supplier, rfp, template, admin). Includes the `/rfp/` (not `/api/rfp/`) note.
7. Create `src/lib/api.ts` with the ky instance. Implement the response unwrap hook. Implement the single-flight 401 refresh interceptor. Export `api`, `ApiError`, and helpers.
8. Create `src/lib/queryKeys.ts` exporting `qk` — every key prefixed with `['app', appId, ...]`.
9. Create `src/stores/auth.ts` (Zustand) with selectors and actions.
10. Create `src/lib/queryClient.ts` exporting the singleton `QueryClient`.
11. Compose providers in `src/main.tsx`: `QueryClientProvider`, `RouterProvider`, `Toaster`. Auth hydration on mount.
12. Generate or hand-write `src/types/api.gen.ts`. Document refresh schedule in this card.
13. Add `vitest` + `msw` setup; write a smoke test that mocks `GET /api/health` and asserts the api client unwraps `data`.
14. Verify `pnpm --filter @apps/web build` produces a bundle.

## Files

### To create
- `apps/web/tailwind.config.ts`
- `apps/web/postcss.config.cjs`
- `apps/web/src/styles/globals.css`
- `apps/web/components.json` *(shadcn config)*
- `apps/web/src/components/ui/*` *(shadcn primitives — one file per component)*
- `apps/web/src/config/env.ts`
- `apps/web/src/lib/endpoints.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/queryClient.ts`
- `apps/web/src/lib/queryKeys.ts`
- `apps/web/src/lib/refresh.ts` *(single-flight refresh helper)*
- `apps/web/src/lib/errors.ts` *(ApiError, isApiError)*
- `apps/web/src/stores/auth.ts`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/_authed/_layout.tsx`
- `apps/web/src/routes/_public/_layout.tsx`
- `apps/web/src/routes/index.tsx` *(redirector)*
- `apps/web/src/routes/__notFound.tsx`
- `apps/web/src/types/api.gen.ts`
- `apps/web/src/test/setup.ts`
- `apps/web/src/test/handlers.ts` *(MSW base handlers)*
- `apps/web/src/lib/__tests__/api.test.ts` *(smoke)*

### To modify
- `apps/web/package.json` — add deps + scripts (`test`, `typecheck`, `gen:types`).
- `apps/web/vite.config.ts` — add `@tanstack/router-plugin/vite`, path aliases.
- `apps/web/tsconfig.json` — strict, `paths` alias `@/*` → `src/*`.
- `apps/web/src/main.tsx` — providers + router.
- `apps/web/.env.example` — document `VITE_API_BASE_URL`, etc.

## State / Schema
No DB changes. Frontend state shape:

```ts
// auth store
type AuthState = {
  userId: number | null;
  email: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
};
```

The auth store is hydrated on mount via a no-op call (or a real `whoami` once FE-15's profile endpoint lands). Until then, hydration succeeds if a refresh succeeds; otherwise the user is treated as unauthenticated.

## Config / Env Vars

`apps/web/.env.example`:
```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_FRONTEND_URL=http://localhost:5173
VITE_DEFAULT_APP_ID=1
```

> All env reads go through `src/config/env.ts`. No `import.meta.env.*` access elsewhere. Mirrors the backend rule in CLAUDE.md.

## Packages

```bash
pnpm --filter @apps/web add \
  @tanstack/react-router @tanstack/react-query \
  zustand react-hook-form @hookform/resolvers zod \
  ky sonner lucide-react date-fns clsx tailwind-merge

pnpm --filter @apps/web add -D \
  @tanstack/router-plugin @tanstack/router-devtools \
  @tanstack/react-query-devtools \
  tailwindcss @tailwindcss/vite postcss autoprefixer \
  openapi-typescript \
  vitest @testing-library/react @testing-library/user-event \
  msw jsdom
```

shadcn primitives are copied in via the CLI, not installed as a package.

## Contracts Exported

For every downstream slice to consume:

```ts
// apps/web/src/lib/endpoints.ts
export const endpoints = {
  auth: {
    register: '/api/no-auth/user/register',
    verifyOtpRegister: '/api/no-auth/user/verify-otp-for-registration',
    login: '/api/no-auth/user/login',
    forgotPassword: '/api/no-auth/user/forgot-password',
    forgotPasswordVerifyOtp: '/api/no-auth/user/forgot-password-verify-otp',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    resetPassword: '/api/auth/reset-password',
    profile: '/api/no-auth/user/profile', // backend stub — see CLAUDE.md
  },
  supplier: {
    list: '/api/supplier/',
    create: '/api/supplier/',
    detail: (id: number) => `/api/supplier/${id}`,
    edit: (id: number) => `/api/supplier/${id}/edit`,
    toggleActive: (id: number) => `/api/supplier/${id}/active-inactive`,
    delete: (id: number) => `/api/supplier/${id}`,
  },
  // KNOWN BACKEND BUG: RFP routes mounted at /rfp/ not /api/rfp/.
  // Single line to flip when backend ships the fix.
  rfp: {
    list: '/rfp/',
    create: '/rfp/',
    detail: (id: number) => `/rfp/${id}`,
  },
  template: {
    list: '/api/template/',
    detail: (id: number) => `/api/template/${id}`,
  },
  admin: {
    inboundUnmatched: '/api/admin/inbound/unmatched',
    inboundDetail: (id: number) => `/api/admin/inbound/${id}`,
    inboundManualMatch: (id: number) => `/api/admin/inbound/${id}/manual-match`,
  },
} as const;
```

```ts
// apps/web/src/lib/queryKeys.ts
export const qk = {
  auth: {
    me: (appId: number) => ['app', appId, 'auth', 'me'] as const,
  },
  supplier: {
    list: (appId: number, query: SupplierListQuery) =>
      ['app', appId, 'supplier', 'list', query] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'supplier', 'detail', id] as const,
  },
  rfp: {
    list: (appId: number, query: RfpListQuery) =>
      ['app', appId, 'rfp', 'list', query] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'rfp', 'detail', id] as const,
  },
  template: {
    list: (appId: number) => ['app', appId, 'template', 'list'] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'template', 'detail', id] as const,
  },
  admin: {
    inboundUnmatched: (appId: number, cursor?: number) =>
      ['app', appId, 'admin', 'inbound', 'unmatched', cursor] as const,
    inboundDetail: (appId: number, id: number) =>
      ['app', appId, 'admin', 'inbound', 'detail', id] as const,
  },
};
```

```ts
// apps/web/src/lib/api.ts (sketch)
import ky, { type KyInstance, HTTPError } from 'ky';
import { env } from '@/config/env';
import { endpoints } from '@/lib/endpoints';
import { ApiError } from '@/lib/errors';
import { runRefresh } from '@/lib/refresh';
import { useAuthStore } from '@/stores/auth';

export const api: KyInstance = ky.create({
  prefixUrl: env.VITE_API_BASE_URL,
  credentials: 'include',
  retry: 0,
  hooks: {
    afterResponse: [
      async (req, _opts, res) => {
        if (res.status !== 401) return;
        if (req.url.endsWith(endpoints.auth.refresh)) return; // avoid loops
        const refreshed = await runRefresh();
        if (!refreshed) {
          useAuthStore.getState().clear();
          throw new ApiError(401, 'Session expired');
        }
        return ky(req); // retry once
      },
    ],
    beforeError: [
      async (error: HTTPError) => {
        const body = await error.response.json().catch(() => ({}));
        return new ApiError(error.response.status, body?.message ?? error.message, body);
      },
    ],
  },
});

// Envelope helper — every feature uses this, never reads `.data` manually.
export async function unwrap<T>(p: Promise<{ success: true; data: T }>): Promise<T> {
  const r = await p;
  return r.data;
}
```

```ts
// apps/web/src/lib/refresh.ts (single-flight)
import { api } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';

let inflight: Promise<boolean> | null = null;
export function runRefresh(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = api
    .post(endpoints.auth.refresh.replace(/^\//, ''))
    .json()
    .then(() => true)
    .catch(() => false)
    .finally(() => { inflight = null; });
  return inflight;
}
```

## Code Sketches

```tsx
// apps/web/src/routes/__root.tsx
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  ),
  notFoundComponent: () => <div>404</div>,
  errorComponent: ({ error }) => <div>Something broke: {String(error)}</div>,
});
```

```tsx
// apps/web/src/routes/_authed/_layout.tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';

export const Route = createFileRoute('/_authed')({
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />, // FE-4 replaces this with the real shell
});
```

## Testing
- **Unit:** `unwrap()` returns `data` field; throws when `success: false`.
- **Unit:** `ApiError` carries status + message + body.
- **Integration (msw):** 401 from a mocked endpoint triggers exactly one `POST /api/auth/refresh`; the original request is retried; concurrent 401s wait on the same refresh.
- **Integration (msw):** refresh failure clears the auth store and redirects to `/login`.
- **Smoke:** `pnpm --filter @apps/web build` produces a bundle; `pnpm --filter @apps/web typecheck` passes.

## Acceptance Criteria
- [ ] `pnpm --filter @apps/web dev` renders an empty shell at `http://localhost:5173`.
- [ ] `pnpm --filter @apps/web build` succeeds with no TS errors.
- [ ] `pnpm --filter @apps/web typecheck` passes.
- [ ] All shadcn primitives imported in a sample page render correctly with Tailwind utility classes.
- [ ] TanStack Router devtools render in dev; route groups `_authed` and `_public` exist.
- [ ] `useAuthStore` exposes the contract shape; can be read/written from any component.
- [ ] Hitting any authed route while unauthenticated redirects to `/login`.
- [ ] MSW smoke test for the 401 refresh single-flight passes.
- [ ] `endpoints.ts` lists every path documented in `docs/PROJECT_CONTEXT.md` + flow docs.
- [ ] `qk` factory keys are namespaced under `['app', appId, ...]`.
- [ ] `.env.example` documents every `VITE_*` variable used.

## Open Questions
- [ ] Does the backend expose an OpenAPI/Swagger doc for `openapi-typescript`? If not, hand-write the v1 types in `api.gen.ts` and refresh later. **Recommendation:** ask backend owner; until then, hand-write.
- [ ] `appId` resolution — at FE-0 we use `env.VITE_DEFAULT_APP_ID`. When backend wires multi-tenancy, replace with a resolver that reads from auth/session. The `qk` factory shape does not change.
- [ ] Should the refresh route be hit at `prefixUrl + endpoints.auth.refresh`? Yes — confirm against backend `app.ts` order (refresh route must be before the authenticate middleware, per `docs/ARCHITECTURE.md`).
- [ ] Toast library — `sonner` over `shadcn/use-toast`? **Recommend sonner** for simplicity; matches the architecture decision.

## Cross-references
- Architecture rationale: prior conversation; in particular the comparison of Vite SPA vs Next.js vs Remix and the recommendation against Redux.
- Backend response envelope + error patterns: [`/docs/CONVENTIONS.md`](../CONVENTIONS.md).
- Backend auth order (refresh before authenticate middleware): [`/docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
- Known backend bug `/rfp/` not `/api/rfp/`: [`/CLAUDE.md`](../../CLAUDE.md) §Known Issues and Stubs.
- Downstream consumers: every FE-N slice imports from `lib/api.ts`, `lib/endpoints.ts`, `lib/queryKeys.ts`, `stores/auth.ts`, and `components/ui/*`.
