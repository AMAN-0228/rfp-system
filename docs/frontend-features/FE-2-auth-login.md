# FE-2 — Auth: Login + Refresh + Logout

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Implement login + logout, hydrate the auth store on app boot, and prove the FE-0 single-flight 401-refresh interceptor against the live backend. After this slice merges, FE-4 (and every authed slice) can ship without re-implementing auth plumbing.

## Dependencies
- **FE-0** — `api`, `endpoints.auth.{login,logout,refresh,profile}`, `useAuthStore`, `runRefresh`.

## Scope

### In scope
- Public route `/_public/login` with email + password (RHF + Zod).
- `POST /api/no-auth/user/login` mutation; backend sets httpOnly cookies; client populates `useAuthStore` with `userId`/`email` from the response.
- Logout button (in any authed shell composition; the actual placement is FE-4) calls `POST /api/auth/logout`, clears `useAuthStore`, redirects to `/login`.
- App-boot hydration: on first mount, attempt to refresh; if it succeeds, mark the user authenticated (the cookie is enough); if it fails, mark unauthenticated. This makes a hard refresh on `/dashboard` work.
- Error surfacing for invalid credentials, locked account, etc. — sonner error toasts.
- Live test of the FE-0 single-flight 401 refresh interceptor against the real backend (replace any temporary mocks).

### Out of scope (handled elsewhere)
- Register → **FE-1**.
- Forgot password / reset → **FE-3**.
- The actual sidebar logout button placement → **FE-4**.
- Profile/whoami endpoint — backend `userProfile` is a TODO stub per CLAUDE.md. Until it lands, hydration uses the refresh response shape (or a no-op confirm).

## Implementation Plan
1. Add `loginSchema` to `features/auth/schemas.ts`.
2. Add `loginMutation`, `logoutMutation`, `bootstrapAuth` to `features/auth/api.ts`. `bootstrapAuth` calls refresh once; on success, returns a session blob; on failure, returns null.
3. Create `routes/_public/login/index.tsx` consuming `<AuthCard>` from FE-1.
4. Add `useBootstrapAuth()` hook that runs once in `main.tsx` (or `__root.tsx`) and updates `useAuthStore.markHydrated()`.
5. Add `useLogout()` hook returning a function suitable for binding to a button. Call site lives in FE-4.
6. Author the integration tests described in **Testing**.

## Files

### To create
- `apps/web/src/routes/_public/login/index.tsx`
- `apps/web/src/features/auth/hooks.ts` *(useLogout, useBootstrapAuth)*
- `apps/web/src/features/auth/__tests__/login.test.tsx`
- `apps/web/src/features/auth/__tests__/refresh.test.tsx`

### To modify
- `apps/web/src/features/auth/schemas.ts` — add `loginSchema`.
- `apps/web/src/features/auth/api.ts` — add login/logout/bootstrap.
- `apps/web/src/main.tsx` — invoke bootstrap on first mount; render a skeleton until `hydrated === true`.
- `apps/web/src/test/handlers.ts` — add login, logout, refresh handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// features/auth/schemas.ts (added)
import { z } from 'zod';
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
```

```ts
// features/auth/hooks.ts
export function useBootstrapAuth(): { hydrated: boolean };
export function useLogout(): () => Promise<void>;
```

`useBootstrapAuth()` is consumed exactly once in `__root.tsx`. `useLogout()` is consumed by FE-4's nav menu.

## Code Sketches

```tsx
// routes/_public/login/index.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, createFileRoute, useSearch } from '@tanstack/react-router';
import { loginSchema, type LoginInput } from '@/features/auth/schemas';
import { login } from '@/features/auth/api';
import { useAuthStore } from '@/stores/auth';
import { AuthCard } from '@/components/auth/AuthCard';

export const Route = createFileRoute('/_public/login/')({
  validateSearch: (s): { redirect?: string } => ({ redirect: s.redirect as string | undefined }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { redirect } = Route.useSearch();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const m = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSession({ userId: data.userId, email: data.email });
      nav({ to: redirect ?? '/dashboard' });
    },
  });
  // ... render form
}
```

```ts
// features/auth/hooks.ts (sketch)
import { useEffect, useState } from 'react';
import { runRefresh } from '@/lib/refresh';
import { api } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import { useAuthStore } from '@/stores/auth';

export function useBootstrapAuth() {
  const { hydrated, markHydrated, setSession, clear } = useAuthStore();
  useEffect(() => {
    if (hydrated) return;
    (async () => {
      const ok = await runRefresh();
      if (ok) {
        // optionally: const me = await api.get(endpoints.auth.profile.replace(/^\//, '')).json();
        // setSession({ ... });
      } else {
        clear();
      }
      markHydrated();
    })();
  }, [hydrated, markHydrated, setSession, clear]);
  return { hydrated };
}
```

## Testing
- **Integration (RTL + MSW):**
  - Login happy path: submit credentials → 200 → auth store populated → navigate to `/dashboard` (or `?redirect=` target).
  - Login failure: 401 → inline error rendered; auth store unchanged.
  - Logout: click → 200 → auth store cleared → redirect to `/login`.
  - Bootstrap: refresh returns 200 → `hydrated: true`, `isAuthenticated: true`. Refresh returns 401 → `hydrated: true`, `isAuthenticated: false`.
- **Integration (single-flight refresh):** mount two queries that both 401; assert exactly one refresh request is sent; both queries retry once and succeed.
- **Live smoke (manual):** with backend running, refreshing `/dashboard` keeps the user logged in for the access-token expiry window via the refresh interceptor.

## Acceptance Criteria
- [ ] `/login` renders email + password; submit dispatches login mutation.
- [ ] On success, auth store carries `userId` + `email`; nav redirects to `?redirect=` if present, else `/dashboard`.
- [ ] On failure, sonner error toast; form remains usable.
- [ ] App boot calls refresh once; UI shows a skeleton until `hydrated`.
- [ ] Hard-refresh on an authed route while logged in stays logged in.
- [ ] Hard-refresh on an authed route while not logged in redirects to `/login` (FE-4 enforces the redirect; FE-2 only sets the auth store correctly).
- [ ] `useLogout()` clears the auth store and calls the logout endpoint; concurrent calls are de-duped.
- [ ] FE-0's single-flight 401 refresh interceptor is verified live: two parallel 401-yielding queries trigger exactly one refresh.

## Open Questions
- [ ] Does login response include `email` and `userId` directly, or only inside the JWT? Per `docs/FLOWS/authentication-flow.md` it returns user data — confirm the exact shape and update `api.gen.ts`.
- [ ] Should bootstrap also call a `/me` endpoint? Not until backend `userProfile` lands (FE-15). For now, refresh success implies "session valid" and that's enough for routing.
- [ ] Treatment of `?redirect=` — accept any same-origin path. Reject external URLs to prevent open-redirect.

## Cross-references
- [`/docs/FLOWS/authentication-flow.md`](../FLOWS/authentication-flow.md) §Login + §Token Refresh + §Logout.
- Single-flight refresh design: [FE-0](./FE-0-foundation.md) §Code Sketches.
- Upstream: [FE-0](./FE-0-foundation.md).
- Downstream: [FE-3](./FE-3-auth-password-reset.md) (reset uses access cookie set by login or a transient login post-OTP); [FE-4](./FE-4-app-shell.md) (consumes `useLogout()`).
