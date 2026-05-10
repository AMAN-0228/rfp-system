# FE-1 — Auth: Register + Verify-OTP

## Status
Not started   Owner: tbd   Effort: ~1.5 days

## Goal
Implement the two-step registration flow documented in [`/docs/FLOWS/authentication-flow.md`](../FLOWS/authentication-flow.md): email/password submission triggers an OTP email; the user enters the OTP on a second screen, which finalises account creation. Surfaces the OTP rate-limit signals from the backend in a way that doesn't make the user retype their email.

## Dependencies
- **FE-0** — `api`, `endpoints.auth.register`, `endpoints.auth.verifyOtpRegister`, `ApiError`, `Form`/`Input`/`Button` primitives, `_public/_layout.tsx`.

## Scope

### In scope
- Public route `/_public/register` with email + password fields (RHF + Zod).
- Public route `/_public/register/verify` with the OTP entry, prefilled with the email from the previous step (held in route state, NOT URL params).
- `POST /api/no-auth/user/register` mutation; on success, navigate to `/register/verify`.
- `POST /api/no-auth/user/verify-otp-for-registration` mutation; on success, navigate to `/login`.
- 60-second resend countdown UI on the OTP screen; "Resend code" button calls register again.
- Rate-limit handling: if backend returns the documented "too many attempts" error, render an inline message + disable resend; do not loop the form.
- Password rules: mirror backend regex (whatever the documented strong-password rule is). Surface on field-level zod errors.
- Email visible but read-only on the OTP screen (so the user knows where the OTP went).
- "Already have an account?" link to `/login`.

### Out of scope (handled elsewhere)
- Login → **FE-2**.
- Forgot password / OTP reuse → **FE-3** (it imports the `<OtpInput>` component shipped here).
- Profile creation flow / supplier registration — not yet documented in the backend.

## Implementation Plan
1. Create `features/auth/schemas.ts` with `registerSchema` and `verifyOtpSchema` (Zod). Add `passwordRule` mirroring the backend regex from `docs/FLOWS/authentication-flow.md`.
2. Create `features/auth/api.ts` with `registerMutation` and `verifyOtpRegistrationMutation` thin wrappers over `api.post()`.
3. Create reusable `<OtpInput>` component (6-digit boxed input, paste support). Place under `components/auth/OtpInput.tsx` so FE-3 can reuse.
4. Create the two routes under `apps/web/src/routes/_public/register/`.
5. Wire the resend-countdown hook (`useResendCountdown(seconds: 60)`).
6. Add MSW handlers for both endpoints in `test/handlers.ts`.
7. Author the integration test described in **Testing**.

## Files

### To create
- `apps/web/src/features/auth/schemas.ts`
- `apps/web/src/features/auth/api.ts`
- `apps/web/src/components/auth/OtpInput.tsx`
- `apps/web/src/components/auth/AuthCard.tsx` *(shared shell — used by FE-1/2/3)*
- `apps/web/src/routes/_public/register/index.tsx`
- `apps/web/src/routes/_public/register/verify.tsx`
- `apps/web/src/features/auth/__tests__/register.test.tsx`

### To modify
- `apps/web/src/test/handlers.ts` — add register + verify-otp MSW handlers.

## Config / Env Vars
None new.

## Packages
None new (RHF + Zod + ky + sonner already in FE-0).

## Contracts Exported

```ts
// apps/web/src/features/auth/schemas.ts
import { z } from 'zod';

export const passwordRule = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'one uppercase')
  .regex(/[a-z]/, 'one lowercase')
  .regex(/\d/, 'one digit')
  .regex(/[^A-Za-z0-9]/, 'one symbol');

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordRule,
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
```

```tsx
// components/auth/OtpInput.tsx (signature)
type Props = { value: string; onChange: (v: string) => void; disabled?: boolean };
export function OtpInput(props: Props): JSX.Element;
```

The `<OtpInput>` and `<AuthCard>` components are imported by FE-3.

## Code Sketches

```tsx
// routes/_public/register/index.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, createFileRoute } from '@tanstack/react-router';
import { registerSchema, type RegisterInput } from '@/features/auth/schemas';
import { register as registerApi } from '@/features/auth/api';
import { AuthCard } from '@/components/auth/AuthCard';

export const Route = createFileRoute('/_public/register/')({ component: RegisterPage });

function RegisterPage() {
  const nav = useNavigate();
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const m = useMutation({
    mutationFn: registerApi,
    onSuccess: (_, vars) => nav({ to: '/register/verify', state: { email: vars.email } }),
  });

  return (
    <AuthCard title="Create your account">
      <form onSubmit={form.handleSubmit((v) => m.mutate(v))}>
        {/* email + password inputs, submit button, error surface */}
      </form>
    </AuthCard>
  );
}
```

```tsx
// routes/_public/register/verify.tsx (sketch)
// - Reads email from history state; if missing, redirect to /register.
// - Renders <OtpInput>; submit calls verify mutation; on success → /login.
// - Resend button disabled for 60s; clicking it calls registerApi again.
```

## Testing
- **Unit:** schema rejects weak passwords, malformed emails.
- **Integration (RTL + MSW):**
  - Happy path: submit email + password → mock 200 → navigate to `/register/verify` with email in state → submit OTP → mock 200 → navigate to `/login`.
  - Resend countdown: starts at 60s, decrements, becomes clickable at 0; resend triggers another register request.
  - Backend "too many attempts" error renders an inline banner; OTP submit button does not become disabled afterwards.
  - Direct visit to `/register/verify` without state redirects to `/register`.

## Acceptance Criteria
- [ ] `/register` renders email + password form; client-side validation matches the backend rules.
- [ ] On register success, navigates to `/register/verify` carrying the email in route state (not URL).
- [ ] OTP entry works as 6 separate boxes with paste support; submit dispatches the verify mutation.
- [ ] Verify success navigates to `/login` with a success toast.
- [ ] Verify failure (wrong OTP) shows an inline error and clears the input.
- [ ] Resend countdown of 60s is enforced client-side; resend re-triggers the register endpoint and resets the timer.
- [ ] Direct visit to `/register/verify` without an email in state redirects to `/register`.
- [ ] All errors flow through `ApiError` and produce sonner error toasts.

## Open Questions
- [ ] Does the backend impose a server-side resend cool-down? Confirm against `apps/api` constants (Redis OTP rate-limit keys per `docs/FLOWS/authentication-flow.md`). Match client cool-down to whichever is stricter.
- [ ] Should we paste-detect a 6-digit string in the email step and auto-advance? **Defer** — premature.
- [ ] Should the email field be editable on the verify screen (to correct typos)? **Recommend no** — force restart from `/register` to keep the OTP-rate-limit semantics simple.

## Cross-references
- [`/docs/FLOWS/authentication-flow.md`](../FLOWS/authentication-flow.md) §Registration + OTP.
- Upstream: [FE-0](./FE-0-foundation.md).
- Downstream: [FE-3](./FE-3-auth-password-reset.md) reuses `<OtpInput>` and `<AuthCard>`.
