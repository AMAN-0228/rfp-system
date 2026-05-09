/**
 * Zustand auth store.
 *
 * Holds the bare minimum identity for the UI: `userId`, `email`, an
 * `isAuthenticated` flag, and a `hydrated` flag flipped after the initial
 * boot-time refresh attempt completes. Tokens themselves live in
 * httpOnly cookies set by the backend — never in JS memory.
 *
 * Curried `create<AuthState>()(...)` form keeps middleware-stacking
 * (devtools, persist) type-safe to add later without rewrites.
 */
import { create } from 'zustand';

export interface AuthState {
  userId: number | null;
  email: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setSession: (session: { userId: number; email: string }) => void;
  markAuthenticated: () => void;
  clear: () => void;
  markHydrated: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  userId: null,
  email: null,
  isAuthenticated: false,
  hydrated: false,
  setSession: ({ userId, email }) =>
    set({ userId, email, isAuthenticated: true }),
  // Set isAuthenticated without populating userId/email — used by the boot
  // refresh, which only proves the cookie is valid. FE-15 will fetch the
  // profile separately and call setSession with the full identity.
  markAuthenticated: () => set({ isAuthenticated: true }),
  // `hydrated` is intentionally NOT reset — logged-out users still need
  // route guards to run, and the app only hydrates once per page load.
  clear: () => set({ userId: null, email: null, isAuthenticated: false }),
  markHydrated: () => set({ hydrated: true }),
}));

/**
 * Non-hook accessor for use outside React (e.g. the api client's 401
 * hook, which can't call hooks). Reads the current snapshot.
 */
export const getAuthState = (): AuthState => useAuthStore.getState();

/**
 * Resolves once `hydrated` flips to true. Used by route loaders/guards to
 * block navigation while the boot refresh is in flight — without this,
 * `_authed` routes could render protected content during the ~200-500ms
 * window before the refresh resolves.
 */
export function waitForHydration(): Promise<void> {
  if (useAuthStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.hydrated) {
        unsubscribe();
        resolve();
      }
    });
  });
}
