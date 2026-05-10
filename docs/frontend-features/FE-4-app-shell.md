# FE-4 — App Shell + Dashboard + Route Guards

## Status
Not started   Owner: tbd   Effort: ~1.5 days

## Goal
Replace FE-0's bare `_authed` outlet with a real authenticated layout — sidebar nav, top bar with user menu, breadcrumbs, toast region, route guards — and a placeholder `/dashboard` page. The dashboard cards are deliberately skeletons; each card belongs to its source feature and lights up as those slices land.

## Dependencies
- **FE-0** — primitives (`Sheet`, `DropdownMenu`, `Button`, `Skeleton`, `Badge`), `_authed` route group.
- **FE-2** — `useLogout()`, hydration semantics.

## Scope

### In scope
- `_authed/_layout.tsx` rendering: left sidebar (RFPs, Suppliers, Templates, Admin, Settings), top bar (breadcrumbs, user menu with email + logout), main outlet, persistent toast region (already in `__root`).
- Route guard: if `!isAuthenticated` after hydration, redirect to `/login?redirect=<currentPath>`.
- `_authed/dashboard/index.tsx` rendering 3 skeleton cards: "RFPs in progress", "Awaiting response", "Recent suppliers". Each card *displays a Skeleton* and is wired to no real query — the FE-N slice that owns the data fills the query in later.
- `_authed/_layout.tsx` includes a "feature flag" badge in the top bar (e.g., "BE F2/F3 pending") so deferred-stub slices announce themselves visibly. Removable when those backends land.
- Mobile responsive: sidebar collapses to a `<Sheet>` below `md`.
- Active route highlighting in the sidebar via TanStack Router's `useMatchRoute`.
- A `<NavItem>` component contract that downstream feature slices can extend if they want sidebar entries.

### Out of scope (handled elsewhere)
- The actual data on each dashboard card.
- Admin sidebar items (rendered conditionally; the role flag isn't in the API yet — gate behind `env.VITE_SHOW_ADMIN === 'true'` until then).
- Settings page → **FE-15**.

## Implementation Plan
1. Replace the placeholder in `routes/_authed/_layout.tsx` with the real shell composition.
2. Create `components/shell/Sidebar.tsx`, `components/shell/TopBar.tsx`, `components/shell/UserMenu.tsx`.
3. Add `routes/_authed/dashboard/index.tsx` with three Skeleton cards.
4. Implement the route guard inside `_authed/_layout.tsx`'s `beforeLoad` — redirect with `redirect` search param.
5. Wire the user-menu logout button to `useLogout()`.
6. Add `index.tsx` redirect at root: authed → `/dashboard`, otherwise → `/login`.
7. Add a Storybook-less "preview" route at `_authed/__dev/components` rendering each shell primitive, only in dev (`if (import.meta.env.DEV)`).
8. Author tests.

## Files

### To create
- `apps/web/src/components/shell/Sidebar.tsx`
- `apps/web/src/components/shell/TopBar.tsx`
- `apps/web/src/components/shell/UserMenu.tsx`
- `apps/web/src/components/shell/NavItem.tsx`
- `apps/web/src/components/shell/Breadcrumbs.tsx`
- `apps/web/src/routes/_authed/dashboard/index.tsx`
- `apps/web/src/routes/_authed/__dev/components.tsx` *(dev-only sandbox)*
- `apps/web/src/routes/_authed/__tests__/guard.test.tsx`

### To modify
- `apps/web/src/routes/_authed/_layout.tsx` — replace stub with real shell + guard.
- `apps/web/src/routes/index.tsx` — redirect logic.

## Config / Env Vars
```bash
VITE_SHOW_ADMIN=false   # flip to true to render the Admin sidebar group (FE-14)
```

## Packages
None new.

## Contracts Exported

```ts
// components/shell/NavItem.tsx
export interface NavItemSpec {
  label: string;
  to: string;
  icon: LucideIcon;
  // future: badge, role gate, feature flag
}
export function NavItem(spec: NavItemSpec): JSX.Element;
```

```ts
// Sidebar exports a default config + a way to extend:
export const SIDEBAR_NAV: NavItemSpec[];   // default groups
```

Downstream slices add to `SIDEBAR_NAV` (or compose their own). FE-9, FE-5, FE-7, FE-14, FE-15 each contribute one entry.

## Code Sketches

```tsx
// routes/_authed/_layout.tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ location }) => {
    const { hydrated, isAuthenticated } = useAuthStore.getState();
    if (!hydrated) return; // root suspends until hydrated
    if (!isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.pathname } });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="grid h-dvh grid-cols-[16rem_1fr]">
      <Sidebar />
      <div className="flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-6"><Outlet /></main>
      </div>
    </div>
  );
}
```

## Testing
- **Integration:**
  - Visit `/dashboard` while not authenticated → redirected to `/login?redirect=/dashboard`.
  - After login, the redirect search param is honoured by FE-2.
  - Visit `/dashboard` while authenticated → renders shell + 3 skeleton cards.
  - Click the user menu → "Logout" button calls FE-2's `useLogout` and redirects.
- **Unit:** `Breadcrumbs` derives crumbs from the matched route tree.

## Acceptance Criteria
- [ ] Authed shell renders sidebar + top bar + outlet on every `/_authed/*` route.
- [ ] Guard redirects unauthed users to `/login?redirect=...`.
- [ ] Dashboard renders 3 skeleton cards; no `useQuery` calls (those belong to source slices).
- [ ] User menu shows email + logout; logout clears auth and redirects.
- [ ] Sidebar collapses to a Sheet on mobile.
- [ ] Active route is highlighted.
- [ ] `VITE_SHOW_ADMIN=true` reveals the Admin group; default hides it.
- [ ] No flicker on hydration: shell does not render while `hydrated: false`.

## Open Questions
- [ ] Where do dashboard cards' real queries live? Each FE-N slice that owns a card adds the `useQuery` call; FE-4 only provides the slot. Decide once FE-9 lands.
- [ ] Is there a `role` field on the user response? Not yet documented. Until then, admin gating uses the env flag.
- [ ] Should the shell prefetch `/api/template` and `/api/supplier?limit=5` for instant nav? **Defer** — premature.

## Cross-references
- [`/CLAUDE.md`](../../CLAUDE.md) §Architecture Overview.
- Upstream: [FE-0](./FE-0-foundation.md), [FE-2](./FE-2-auth-login.md).
- Downstream: every authed slice (FE-5, FE-7, FE-9, FE-14, FE-15) registers a sidebar item via `SIDEBAR_NAV`.
