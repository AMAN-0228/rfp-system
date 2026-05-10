# FE-3 — Auth: Forgot Password + Verify-OTP + Reset

## Status
Not started   Owner: tbd   Effort: ~1 day

## Goal
Implement the password-reset flow documented in [`/docs/FLOWS/authentication-flow.md`](../FLOWS/authentication-flow.md): the user requests an OTP by email, verifies it, and sets a new password. Reuses `<OtpInput>` and `<AuthCard>` from FE-1. Hides the backend's "reset requires an access token" quirk inside a single mutation hook so the UI stays clean.

## Dependencies
- **FE-0** — `api`, `endpoints.auth.{forgotPassword,forgotPasswordVerifyOtp,resetPassword}`, primitives.
- **FE-1** — `<OtpInput>`, `<AuthCard>`, `passwordRule`.
- **FE-2** — auth store semantics (the post-OTP transient session must not be confused with a real login).

## Scope

### In scope
- Public route `/_public/forgot-password` — email entry → `POST /api/no-auth/user/forgot-password`.
- Public route `/_public/forgot-password/verify` — OTP entry; on success the backend issues a transient access cookie. Pre-fills email from route state.
- Public route `/_public/reset-password` — new password + confirm; calls `POST /api/auth/reset-password`. Auth header / cookie is whatever the previous step issued.
- Resend countdown 60s on the OTP screen (reuse the hook from FE-1).
- On reset success, clear any transient session, navigate to `/login` with a success toast.
- Backend quirk: reset-password requires an `accessToken`. Encapsulate the post-OTP→reset transition (and the cookie semantics) inside `useResetPasswordFlow()`. The UI never sees a token.

### Out of scope (handled elsewhere)
- Change-password-while-logged-in (will live in FE-15 settings).
- Re-using the OTP component with magic-link variants — no magic links in scope.

## Implementation Plan
1. Add Zod schemas: `forgotPasswordSchema`, `resetPasswordSchema` (new + confirm; refine that they match).
2. Add `features/auth/api.ts` mutations: `forgotPassword`, `forgotPasswordVerifyOtp`, `resetPassword`.
3. Add `useResetPasswordFlow()` hook orchestrating the three steps; track step in route state, not Zustand.
4. Create the three routes under `routes/_public/` (`forgot-password/`, `forgot-password/verify/`, `reset-password/`).
5. Reuse the resend countdown from FE-1 (extract to `features/auth/hooks.ts` if not already).
6. After successful reset, ensure the auth store is `clear()`'d so the user must log in again.
7. Author tests.

## Files

### To create
- `apps/web/src/routes/_public/forgot-password/index.tsx`
- `apps/web/src/routes/_public/forgot-password/verify.tsx`
- `apps/web/src/routes/_public/reset-password/index.tsx`
- `apps/web/src/features/auth/__tests__/reset.test.tsx`

### To modify
- `apps/web/src/features/auth/schemas.ts` — add forgot/reset schemas.
- `apps/web/src/features/auth/api.ts` — add forgot/verify-otp/reset mutations.
- `apps/web/src/features/auth/hooks.ts` — extract `useResendCountdown` if private to FE-1; export it.
- `apps/web/src/test/handlers.ts` — add forgot/verify/reset MSW handlers.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported

```ts
// schemas (added)
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z
  .object({ password: passwordRule, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'must match' });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

```ts
// hooks (extended)
export function useResendCountdown(seconds: number): { secondsLeft: number; restart: () => void };
```

## Code Sketches

```tsx
// routes/_public/forgot-password/verify.tsx
// - Reads email from history state; missing → redirect to /forgot-password.
// - <OtpInput> + verify mutation.
// - On success → navigate to /reset-password (transient cookie now set by backend).
```

```ts
// features/auth/api.ts (excerpt)
export async function resetPassword(v: ResetPasswordInput) {
  // Backend uses the existing access cookie issued by verify-otp.
  // No client-side token wrangling.
  return unwrap(api
    .post(endpoints.auth.resetPassword.replace(/^\//, ''), { json: v })
    .json<{ success: true; data: unknown }>());
}
```

## Testing
- **Integration:**
  - Happy path: forgot → verify → reset → toast → redirect to `/login`.
  - OTP failure: inline error; resend countdown still active.
  - Reset failure (e.g., new password equals old per backend rule): inline error; form remains.
  - Direct visit to `/reset-password` without going through verify: redirect to `/forgot-password`.
- **Unit:** schema rejects mismatched confirms.

## Acceptance Criteria
- [ ] `/forgot-password` accepts email; on submit calls `POST /api/no-auth/user/forgot-password`.
- [ ] `/forgot-password/verify` accepts OTP; on success navigates to `/reset-password`.
- [ ] `/reset-password` accepts new password (with strength rules) + confirm; on success navigates to `/login` with toast.
- [ ] After reset, the auth store is empty (user must log in fresh).
- [ ] Direct visits to `verify` or `reset-password` without prior step redirect to `/forgot-password`.
- [ ] Errors flow through `ApiError`; rate-limit messages from the backend render inline.

## Open Questions
- [ ] What "reset requires access token" means in practice — is it a normal access cookie set on verify-otp, or a special short-lived reset cookie? Confirm against `apps/api/src` (do NOT explore in this slice; ask backend owner). The flow doc implies a normal access cookie.
- [ ] Should logout-everywhere happen on successful reset (server-side session invalidation)? **Recommend yes** — security best practice. Out of scope for this slice if backend doesn't support it; track as a backend issue.

## Cross-references
- [`/docs/FLOWS/authentication-flow.md`](../FLOWS/authentication-flow.md) §Forgot Password.
- Upstream: [FE-0](./FE-0-foundation.md), [FE-1](./FE-1-auth-register.md), [FE-2](./FE-2-auth-login.md).
