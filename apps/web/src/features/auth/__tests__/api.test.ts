// @vitest-environment node
/**
 * Integration tests for the registration network calls against MSW.
 *
 * Asserts:
 *  - Each function posts to the documented URL with the documented payload.
 *  - Backend error responses surface as `ApiError(status, ...)` so the
 *    UI can pattern-match on `err.status` (400 = OTP cooldown,
 *    429 = rate-limit block — both exposed unchanged per
 *    /docs/FLOWS/authentication-flow.md).
 *
 * Each test injects per-test handlers via `server.use(...)` so the
 * declared network surface stays tight (handlers.ts is empty by design).
 */
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { http, HttpResponse } from '@/test/handlers';
import {
  registerUser,
  verifyOtpForRegistration,
} from '@/features/auth/api';
import { ApiError } from '@/lib/errors';
import { env } from '@/config/env';

const BASE = env.VITE_API_BASE_URL;

describe('registerUser', () => {
  it('posts { name, email, password } to /api/no-auth/user/register and resolves', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${BASE}/api/no-auth/user/register`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ success: true, data: null });
        },
      ),
    );

    await expect(
      registerUser({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
      }),
    ).resolves.toBeUndefined();

    expect(captured).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Abcd123!',
    });
  });

  it('rejects with ApiError(429) when the backend rate-limits', async () => {
    server.use(
      http.post(
        `${BASE}/api/no-auth/user/register`,
        async () =>
          HttpResponse.json(
            { success: false, message: 'Too many attempts' },
            { status: 429 },
          ),
      ),
    );

    await expect(
      registerUser({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
    });

    // Re-issue to assert instance type (the first promise has been consumed).
    server.use(
      http.post(
        `${BASE}/api/no-auth/user/register`,
        async () =>
          HttpResponse.json(
            { success: false, message: 'Too many attempts' },
            { status: 429 },
          ),
      ),
    );

    await expect(
      registerUser({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('verifyOtpForRegistration', () => {
  it('posts { name, email, password, otp } and resolves on success', async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `${BASE}/api/no-auth/user/verify-otp-for-registration`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ success: true, data: null });
        },
      ),
    );

    await expect(
      verifyOtpForRegistration({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
        otp: '1234',
      }),
    ).resolves.toBeUndefined();

    expect(captured).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Abcd123!',
      otp: '1234',
    });
  });

  it('rejects with ApiError(400) when the OTP is wrong', async () => {
    server.use(
      http.post(
        `${BASE}/api/no-auth/user/verify-otp-for-registration`,
        async () =>
          HttpResponse.json(
            { success: false, message: 'Invalid OTP' },
            { status: 400 },
          ),
      ),
    );

    await expect(
      verifyOtpForRegistration({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
        otp: '9999',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
    });

    server.use(
      http.post(
        `${BASE}/api/no-auth/user/verify-otp-for-registration`,
        async () =>
          HttpResponse.json(
            { success: false, message: 'Invalid OTP' },
            { status: 400 },
          ),
      ),
    );

    await expect(
      verifyOtpForRegistration({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
        otp: '9999',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
