/**
 * Base MSW handler list — empty by design.
 *
 * Tests register per-test handlers via `server.use(...)`. We re-export
 * `http` and `HttpResponse` so test files have a single import for
 * everything MSW-related:
 *
 *   import { server } from '@/test/server';
 *   import { http, HttpResponse } from '@/test/handlers';
 *
 * Per-feature handler factories (e.g. `registerSuccessHandler`) live here
 * too. Tests import the factory and inject it explicitly via `server.use`
 * — we deliberately do NOT append them to the default `handlers` array,
 * so every test file's network surface stays explicit (combined with
 * `onUnhandledRequest: 'error'` in setup.ts).
 */
import { http, HttpResponse, type HttpHandler } from 'msw';

export const handlers: HttpHandler[] = [];

export { http, HttpResponse };

/**
 * Happy-path handler for `POST /api/no-auth/user/register`.
 * Returns the standard `{ success, message }` envelope.
 */
export function registerSuccessHandler(baseUrl: string): HttpHandler {
  return http.post(`${baseUrl}/api/no-auth/user/register`, async () =>
    HttpResponse.json({ success: true, message: 'OTP sent' }),
  );
}

/**
 * Happy-path handler for `POST /api/no-auth/user/verify-otp-for-registration`.
 * Returns the standard `{ success, message }` envelope.
 */
export function verifyOtpSuccessHandler(baseUrl: string): HttpHandler {
  return http.post(
    `${baseUrl}/api/no-auth/user/verify-otp-for-registration`,
    async () => HttpResponse.json({ success: true, message: 'Registered' }),
  );
}

/**
 * Happy-path handler for `POST /api/no-auth/user/login`.
 * Returns user data within the `{ success, data }` envelope.
 */
export function loginSuccessHandler(
  baseUrl: string,
  userId: number = 1,
  email: string = 'test@example.com',
): HttpHandler {
  return http.post(`${baseUrl}/api/no-auth/user/login`, async () =>
    HttpResponse.json({ success: true, data: { userId, email } }),
  );
}

/**
 * Happy-path handler for `POST /api/auth/logout`.
 * Returns the standard `{ success, message }` envelope.
 */
export function logoutSuccessHandler(baseUrl: string): HttpHandler {
  return http.post(`${baseUrl}/api/auth/logout`, async () =>
    HttpResponse.json({ success: true, message: 'Logged out' }),
  );
}

/**
 * Happy-path handler for `POST /api/auth/refresh`.
 * Returns user data within the `{ success, data }` envelope.
 */
export function refreshSuccessHandler(
  baseUrl: string,
  userId: number = 1,
  email: string = 'test@example.com',
): HttpHandler {
  return http.post(`${baseUrl}/api/auth/refresh`, async () =>
    HttpResponse.json({ success: true, data: { userId, email } }),
  );
}
