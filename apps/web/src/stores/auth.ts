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
  clear: () => set({ userId: null, email: null, isAuthenticated: false }),
  markHydrated: () => set({ hydrated: true }),
}));

/**
 * Non-hook accessor for use outside React (e.g. the api client's 401
 * hook, which can't call hooks). Reads the current snapshot.
 */
export const getAuthState = (): AuthState => useAuthStore.getState();
