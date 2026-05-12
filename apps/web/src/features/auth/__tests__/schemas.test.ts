/**
 * Unit tests for the registration zod schemas.
 *
 * These guard the client-side rules that mirror backend validation:
 *  - `passwordRule` — strong-password regex (length + classes).
 *  - `registerSchema` — composes name + email + password.
 *  - `verifyOtpSchema` — exactly 4 numeric digits (matches backend OTP shape).
 *  - `registerCarryOverSchema` — runtime guard for the verify route's
 *    history-state blob.
 *
 * Pure, no MSW, no React. Default node test environment is fine.
 */
import { describe, expect, it } from 'vitest';
import {
  passwordRule,
  registerCarryOverSchema,
  registerSchema,
  verifyOtpSchema,
} from '@/features/auth/schemas';

describe('passwordRule', () => {
  it('rejects strings shorter than 8 characters', () => {
    expect(passwordRule.safeParse('Ab1!').success).toBe(false);
  });

  it('rejects passwords missing an uppercase letter', () => {
    expect(passwordRule.safeParse('abcd123!').success).toBe(false);
  });

  it('rejects passwords missing a lowercase letter', () => {
    expect(passwordRule.safeParse('ABCD123!').success).toBe(false);
  });

  it('rejects passwords missing a digit', () => {
    expect(passwordRule.safeParse('Abcdefg!').success).toBe(false);
  });

  it('rejects passwords missing a symbol', () => {
    expect(passwordRule.safeParse('Abcd1234').success).toBe(false);
  });

  it('accepts a valid strong password', () => {
    expect(passwordRule.safeParse('Abcd123!').success).toBe(true);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'Abcd123!',
  };

  it('accepts a valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(registerSchema.safeParse({ ...valid, name: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects a malformed email', () => {
    expect(
      registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rejects a weak password (no symbol)', () => {
    expect(
      registerSchema.safeParse({ ...valid, password: 'Abcd1234' }).success,
    ).toBe(false);
  });

  it('rejects a weak password (too short)', () => {
    expect(
      registerSchema.safeParse({ ...valid, password: 'Ab1!' }).success,
    ).toBe(false);
  });
});

describe('verifyOtpSchema', () => {
  it('accepts exactly 4 digits', () => {
    expect(verifyOtpSchema.safeParse({ otp: '1234' }).success).toBe(true);
  });

  it('rejects a 5-digit OTP', () => {
    expect(verifyOtpSchema.safeParse({ otp: '12345' }).success).toBe(false);
  });

  it('rejects an alphabetic OTP', () => {
    expect(verifyOtpSchema.safeParse({ otp: 'abcd' }).success).toBe(false);
  });

  it('rejects an empty OTP', () => {
    expect(verifyOtpSchema.safeParse({ otp: '' }).success).toBe(false);
  });

  it('rejects a 3-digit OTP', () => {
    expect(verifyOtpSchema.safeParse({ otp: '123' }).success).toBe(false);
  });
});

describe('registerCarryOverSchema', () => {
  it('accepts a complete carry-over blob', () => {
    expect(
      registerCarryOverSchema.safeParse({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Abcd123!',
      }).success,
    ).toBe(true);
  });

  it('rejects a blob missing the password (verify route should bounce)', () => {
    expect(
      registerCarryOverSchema.safeParse({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }).success,
    ).toBe(false);
  });

  it('rejects a blob with a malformed email', () => {
    expect(
      registerCarryOverSchema.safeParse({
        name: 'Ada Lovelace',
        email: 'nope',
        password: 'Abcd123!',
      }).success,
    ).toBe(false);
  });
});
