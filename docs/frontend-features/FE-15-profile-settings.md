# FE-15 — Profile / Settings

## Status
**Deferred-stub** (lights up when backend `userProfile` controller lands)   Owner: tbd   Effort: ~½ day

This slice follows the [F8 deferred-stub pattern](../email-features/F8-ai-processing.md): reserves the route, defines the contract, ships a placeholder so nav menu links don't 404. Per [`/CLAUDE.md`](../../CLAUDE.md) §Known Issues and Stubs, `userAuth.ts userProfile` is a TODO placeholder returning no data — once that fills in, this slice flips on.

## Goal
Provide a `/_authed/settings` route stub: shows the user's email (already in the auth store from FE-2), and placeholder cards for "Profile", "Change password", and "Sessions" — all greyed out with "Available soon" messaging until backend support exists. Avoids dead nav links and gives the next implementer a clear contract.

## Dependencies
- **FE-2** — auth store carries email + userId.
- **FE-4** — sidebar slot.
- **Backend** — `userProfile` controller completion + a documented update endpoint.

## Scope

### In scope (today)
- Authed route `/_authed/settings/index.tsx`.
- Header showing the auth-store email + "Member since" placeholder.
- Three cards: Profile, Change password, Sessions — each disabled with a "Available soon" badge and a documented contract for the future implementer.
- Sidebar entry "Settings" (under the user menu in the top bar instead of the main sidebar).

### In scope (when backend lands)
- Profile edit form (name).
- Change-password form (current + new + confirm) — reuses `passwordRule` from FE-1.
- Active sessions list (if backend exposes it) with "Revoke" actions.

### Out of scope
- API key management — no docs for this.
- Notification preferences — no backend support.

## Implementation Plan
1. Stand up `routes/_authed/settings/index.tsx` with the three placeholder cards.
2. Reserve `features/settings/api.ts` and `features/settings/schemas.ts` as empty exports (typed but unimplemented).
3. Add Settings entry to FE-4's user menu.
4. Smoke test that the route renders.

## Files

### To create
- `apps/web/src/routes/_authed/settings/index.tsx`
- `apps/web/src/features/settings/api.ts` *(empty / TODO)*
- `apps/web/src/features/settings/schemas.ts` *(empty / TODO)*

### To modify
- `apps/web/src/components/shell/UserMenu.tsx` — add "Settings" link.

## Config / Env Vars
None new.

## Packages
None new.

## Contracts Exported (future shape — for next implementer)

```ts
// features/settings/schemas.ts (future)
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordRule,                    // reuse FE-1
  confirm: z.string(),
}).refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'must match' });
```

```ts
// features/settings/api.ts (future)
export function getProfile(): Promise<{ id: number; email: string; name: string; createdAt: string }>;
export function updateProfile(input: ProfileInput): Promise<unknown>;
export function changePassword(input: ChangePasswordInput): Promise<unknown>;
```

## Code Sketches

```tsx
// routes/_authed/settings/index.tsx
function SettingsPage() {
  const email = useAuthStore((s) => s.email);
  return (
    <div className="grid gap-4 max-w-2xl">
      <Card>
        <CardHeader>Profile</CardHeader>
        <CardContent>
          <div>Email: {email}</div>
          <Badge variant="secondary">Available soon</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>Change password</CardHeader>
        <CardContent>
          <Badge variant="secondary">Available soon</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>Sessions</CardHeader>
        <CardContent>
          <Badge variant="secondary">Available soon</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
```

## Testing
- **Smoke:** route renders, displays auth store email, three "Available soon" cards.

## Acceptance Criteria
- [ ] `/settings` route exists.
- [ ] Email shown matches the auth store.
- [ ] Three cards rendered with "Available soon" badges.
- [ ] User menu links to `/settings`.
- [ ] Once backend `userProfile` lands, the next implementer can fill in the three forms without changing routes or contracts.

## Open Questions
- [ ] Does backend support change-password while logged in (separate from forgot-password)? Currently only `/api/auth/reset-password` exists, and that requires either an old password OR a transient session post-OTP. Confirm with backend owner before implementing the form.
- [ ] Sessions endpoint — does the backend track `RefreshToken` rows we can list/revoke? If not, defer the Sessions card entirely and remove it from this stub.

## Cross-references
- [`/CLAUDE.md`](../../CLAUDE.md) §Known Issues and Stubs (`userAuth.ts userProfile`).
- Upstream: [FE-2](./FE-2-auth-login.md) (auth store), [FE-4](./FE-4-app-shell.md) (user menu).
- Pattern reference: [F8 deferred-stub](../email-features/F8-ai-processing.md).
