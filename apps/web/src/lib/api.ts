/**
 * ky-based HTTP client for the web app.
 *
 * Responsibilities:
 *  - Prepend `VITE_API_BASE_URL` to all relative paths.
 *  - Send cookies (httpOnly access/refresh tokens) on every request.
 *  - On 401, run the single-flight refresh and retry the original request
 *    exactly once. If refresh fails, clear auth state and throw a typed
 *    `ApiError` so feature code can react.
 *  - Normalise every non-2xx response into an `ApiError` carrying status,
 *    message, and parsed body.
 */
import ky, { type KyInstance, type HTTPError } from 'ky';
import { env } from '@/config/env';
import { endpoints } from '@/lib/endpoints';
import { ApiError } from '@/lib/errors';
import { runRefresh } from '@/lib/refresh';
import { useAuthStore } from '@/stores/auth';

interface ErrorBody {
  message?: string;
  [key: string]: unknown;
}

export const api: KyInstance = ky.create({
  prefixUrl: env.VITE_API_BASE_URL,
  credentials: 'include',
  retry: 0,
  hooks: {
    afterResponse: [
      async (req, _opts, res) => {
        if (res.status !== 401) return;
        // Avoid recursion: refresh hitting 401 should not trigger another refresh.
        if (req.url.endsWith(endpoints.auth.refresh)) return;

        const refreshed = await runRefresh();
        if (!refreshed) {
          useAuthStore.getState().clear();
          throw new ApiError(401, 'Session expired', null);
        }
        // Retry the original request exactly once.
        return ky(req);
      },
    ],
    beforeError: [
      async (error: HTTPError) => {
        let body: ErrorBody = {};
        try {
          // Clone before reading: in some ky/fetch paths the original body
          // may already be consumed by the time this hook runs, and reading
          // a consumed stream throws.
          body = (await error.response.clone().json()) as ErrorBody;
        } catch {
          // Response had no JSON body — keep the empty object.
        }
        const message =
          typeof body?.message === 'string' && body.message.length > 0
            ? body.message
            : error.message;
        // ky's beforeError must return an Error; throwing here would be
        // wrapped as an unhandled rejection. Returning the ApiError makes
        // ky reject the original promise with our typed error.
        return new ApiError(error.response.status, message, body) as unknown as HTTPError;
      },
    ],
  },
});

/**
 * Envelope helper. Every backend success response is `{ success: true, data: T }`.
 * Feature code calls `unwrap(api.get(...).json<...>())` so it never reaches
 * for `.data` manually.
 *
 * Includes a runtime guard: if the backend ever returns 2xx with
 * `success: false` (a contract violation, not a network error), we surface
 * it loudly instead of silently returning `undefined`.
 */
export async function unwrap<T>(
  p: Promise<{ success: true; data: T }>,
): Promise<T> {
  const r = await p;
  if (
    r === null ||
    typeof r !== 'object' ||
    (r as { success?: unknown }).success !== true
  ) {
    throw new ApiError(200, 'Unexpected response shape', r);
  }
  return r.data;
}
