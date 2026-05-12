/**
 * Network calls for the registration flow.
 *
 * Both endpoints are public (`/no-auth/...`) and return the standard
 * `{ success: true, message: '...' }` envelope. We pipe the response
 * through `unwrap()` for the runtime envelope guard but discard the inner
 * payload — the UI only cares whether the call resolved.
 *
 * ky strips a leading `/` automatically when a `prefixUrl` is set, but we
 * strip it explicitly here so the intent is obvious at the call site.
 *
 * Errors surface as `ApiError` (status + parsed body). The verify route
 * needs to distinguish:
 *   - 429 → user is currently rate-limit-blocked
 *   - 400 → an OTP is already pending for this email (cooldown)
 * Both are surfaced unchanged; the UI inspects `err.status`.
 */
import { api, unwrap } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import {
  type RegisterCarryOver,
  type RegisterInput,
  type VerifyOtpInput,
} from '@/features/auth/schemas';

const registerPath = endpoints.auth.register.replace(/^\//, '');
const verifyOtpPath = endpoints.auth.verifyOtpRegister.replace(/^\//, '');

export async function registerUser(input: RegisterInput): Promise<void> {
  await unwrap(
    api
      .post(registerPath, { json: input })
      .json<{ success: true; data: unknown }>(),
  );
}

export async function verifyOtpForRegistration(
  input: RegisterCarryOver & VerifyOtpInput,
): Promise<void> {
  await unwrap(
    api
      .post(verifyOtpPath, { json: input })
      .json<{ success: true; data: unknown }>(),
  );
}
