/**
 * Base MSW handler list — empty by design.
 *
 * Tests register per-test handlers via `server.use(...)`. We re-export
 * `http` and `HttpResponse` so test files have a single import for
 * everything MSW-related:
 *
 *   import { server } from '@/test/server';
 *   import { http, HttpResponse } from '@/test/handlers';
 */
import { http, HttpResponse, type HttpHandler } from 'msw';

export const handlers: HttpHandler[] = [];

export { http, HttpResponse };
