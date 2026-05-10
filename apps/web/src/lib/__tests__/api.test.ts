/**
 * FE-0 smoke tests for the api client.
 *
 * Three behaviours, in order of importance:
 *  1. Envelope unwrapping — `unwrap()` returns the `.data` field of a
 *     `{ success: true, data: T }` response.
 *  2. Single-flight 401 refresh — two parallel 401s trigger exactly ONE
 *     refresh; both originals are retried after refresh succeeds.
 *  3. Refresh failure — clears the auth store and surfaces an `ApiError`
 *     with status 401 to the caller.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { http, HttpResponse } from '@/test/handlers';
import { api, unwrap } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { env } from '@/config/env';
import { useAuthStore } from '@/stores/auth';

const BASE = env.VITE_API_BASE_URL;

afterEach(() => {
  // Reset auth store between tests so assertions about isAuthenticated
  // start from a known baseline.
  useAuthStore.getState().clear();
});

describe('api client', () => {
  it('unwraps the response envelope', async () => {
    server.use(
      http.get(`${BASE}/api/health`, () =>
        HttpResponse.json({ success: true, data: { status: 'ok' } }),
      ),
    );

    const result = await unwrap(
      api
        .get('api/health')
        .json<{ success: true; data: { status: string } }>(),
    );

    expect(result).toEqual({ status: 'ok' });
  });

  it('single-flight 401 refresh — two parallel 401 requests trigger exactly one refresh and both retry', async () => {
    let refreshCount = 0;
    // Tracks how many times each parallel caller has hit the protected
    // endpoint. First call from each → 401, second call → 200.
    const protectedCalls = { count: 0 };
    // We need two calls' first hit to BOTH return 401 before either retries,
    // so the trigger is "first two calls 401, all subsequent calls 200".
    // That is enough to drive both into the refresh hook concurrently.

    server.use(
      http.get(`${BASE}/api/some-protected`, () => {
        protectedCalls.count += 1;
        if (protectedCalls.count <= 2) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: { ok: true } });
      }),
      http.post(`${BASE}/api/auth/refresh`, () => {
        refreshCount += 1;
        return HttpResponse.json({ success: true, data: null });
      }),
    );

    const results = await Promise.all([
      api
        .get('api/some-protected')
        .json<{ success: true; data: { ok: boolean } }>(),
      api
        .get('api/some-protected')
        .json<{ success: true; data: { ok: boolean } }>(),
    ]);

    expect(refreshCount).toBe(1);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ success: true, data: { ok: true } });
    expect(results[1]).toEqual({ success: true, data: { ok: true } });
    // 4 total: 2 initial 401s + 2 retries.
    expect(protectedCalls.count).toBe(4);
  });

  it('refresh failure clears auth store and throws ApiError(401)', async () => {
    // Seed an authenticated session so we can verify `clear()` ran.
    useAuthStore
      .getState()
      .setSession({ userId: 7, email: 'u@example.com' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    server.use(
      http.get(
        `${BASE}/api/some-protected`,
        () => new HttpResponse(null, { status: 401 }),
      ),
      http.post(
        `${BASE}/api/auth/refresh`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    await expect(
      api.get('api/some-protected').json(),
    ).rejects.toMatchObject({
      // Use matcher rather than instanceOf so we get a useful diff if it
      // throws something else.
      name: 'ApiError',
      status: 401,
    });

    // Sanity: it really is an ApiError instance, not just a shape match.
    await expect(
      api.get('api/some-protected').json(),
    ).rejects.toBeInstanceOf(ApiError);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
