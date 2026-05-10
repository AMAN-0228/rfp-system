/**
 * Vitest global setup.
 *
 * Runs once per test file before any test in that file. Two responsibilities:
 *
 *  1. Stub the `import.meta.env` values that `@/config/env` reads at module
 *     load time. Must happen BEFORE any test imports `@/config/env`
 *     (transitively via `@/lib/api`, etc.) — `vi.stubEnv` is safe to call
 *     at top level here because vitest evaluates setup files first.
 *  2. Boot the MSW server, reset handlers between tests, and tear it down
 *     after the file finishes. Per-test handlers are appended via
 *     `server.use(...)` inside individual tests.
 */
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Stub every VITE_* var that `src/config/env.ts` validates at load time.
// Mirrors `apps/web/.env.example`; missing any of these throws synchronously
// from the env module and breaks the whole test file.
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080');
vi.stubEnv('VITE_FRONTEND_URL', 'http://localhost:5173');
vi.stubEnv('VITE_DEFAULT_APP_ID', '1');
vi.stubEnv('VITE_SHOW_ADMIN', 'false');
vi.stubEnv('VITE_DELIVERY_STATUS_LIVE', 'false');
vi.stubEnv('VITE_SUPPLIER_PORTAL_LIVE', 'false');

// Importing the server AFTER env is stubbed isn't strictly required (it
// doesn't read env), but it keeps the ordering rule consistent.
const { server } = await import('./server');

beforeAll(() => {
  // `onUnhandledRequest: 'error'` makes any un-mocked network call fail loudly,
  // which is what we want — tests should explicitly declare every endpoint
  // they touch.
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
