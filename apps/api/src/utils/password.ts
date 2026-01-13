
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import prisma from '../config/database';
import { TokenPayload } from './tokens';
import { sendOtp, verifyOtp } from './opt';
import { ValidationError } from './errors';

export const hashPassword = async (password: string): Promise<string> => {
  if (!password) {
    throw new ValidationError('Password is required for hashing');
  }

  const hashedPassword = await bcrypt.hash(password, env.SALT_ROUNDS);

  return hashedPassword;
};

export const verifyPassword = async (
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> => {
  // Validate inputs
  if (!plainPassword) {
    throw new ValidationError('Plain password is required for verification');
  }
  if (!hashedPassword) {
    throw new ValidationError('Hashed password is required for verification');
  }

  const isMatch = await bcrypt.compare(plainPassword, hashedPassword);

  return isMatch;
};

const changePassword = async (userId: number, password: string) => {
  if (!userId || !password) {
    throw new ValidationError('User ID and password are required for changing password');
  }
  const hashedPassword = await hashPassword(password);
  await prisma.users.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

export const resetPassword = async ({ email, password, oldPassword, isForgotPassword }: { email: string, password: string, oldPassword?: string, isForgotPassword: boolean }, auth?: TokenPayload) => {
  if (!email || !password) {
    throw new ValidationError('Email and new password are required for resetting password');
  }
  if (!isForgotPassword && !oldPassword) {
    throw new ValidationError('Old password is required for resetting password');
  }
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
  });
  if (!user) {
    throw new ValidationError('User not found');
  }

  if (!isForgotPassword) {
    const isMatch = await verifyPassword(oldPassword!, user.password);
    if (!isMatch) {
      throw new ValidationError('Old password is incorrect');
    }
  }
  return changePassword(user.id, password);
};

export const forgotPassword = async (email: string) => {
  if (!email) {
    throw new ValidationError('Email is required for forgot password');
  }
  const user = await prisma.users.findUnique({
    where: {
      email,
    },
  });
  if (!user) {
    throw new ValidationError('User not found');
  }
  await sendOtp(email);
  // return true;
};

export const forgotPasswordVerify = async (email: string, otp: string) => {
if (!email || !otp) {
    throw new ValidationError('Email and OTP are required for forgot password verification');
  }
  return await verifyOtp({ email, otp });
};