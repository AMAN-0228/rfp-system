/**
 * Zod schemas for the registration flow.
 *
 * Two-step registration: the user submits { name, email, password } to
 * `/register`, the backend stashes an OTP in Redis and emails it. The user
 * then submits the OTP on `/register/verify` and the backend re-validates
 * { name, email, password, otp } in a single shot to actually create the
 * row. Because the verify route doesn't have its own form for name/email/
 * password, those values ride along in router history state — see
 * `registerCarryOverSchema` for the runtime guard the verify route uses to
 * decide whether the carry-over blob is intact or it should bounce back to
 * `/register`.
 *
 * Backend reality (see /docs/FLOWS/authentication-flow.md):
 *  - OTP is 4 digits (`Math.floor(1000 + random * 9000)`).
 *  - Password regex mirrors the backend strong-password rule.
 */
import { z } from 'zod';

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'one uppercase')
  .regex(/[a-z]/, 'one lowercase')
  .regex(/\d/, 'one digit')
  .regex(/[^A-Za-z0-9]/, 'one symbol');

export const nameRule = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

export const emailRule = z.string().email();

export const registerSchema = z.object({
  name: nameRule,
  email: emailRule,
  password: passwordRule,
});

export const verifyOtpSchema = z.object({
  otp: z
    .string()
    .length(4)
    .regex(/^\d{4}$/, 'OTP must be 4 digits'),
});

/**
 * Validates the history-state blob that the verify route reads. If parsing
 * fails the verify route should redirect to `/register` — the user
 * presumably hit the URL directly with no carry-over.
 */
export const registerCarryOverSchema = z.object({
  name: nameRule,
  email: emailRule,
  password: passwordRule,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterCarryOver = z.infer<typeof registerCarryOverSchema>;
