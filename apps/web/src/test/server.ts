/**
 * Shared MSW server instance.
 *
 * Tests import `server` from this module and append per-test handlers via
 * `server.use(...)`. The base handler list is intentionally empty so each
 * test fully declares its expected network surface — combined with
 * `onUnhandledRequest: 'error'` in setup.ts this catches accidental drift
 * between code and tests.
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
