
import bcrypt from 'bcrypt';
import { env } from '../config/env';

export const hashPassword = async (password: string): Promise<string> => {
  if (!password) {
    throw new Error('Password is required for hashing');
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
    throw new Error('Plain password is required for verification');
  }
  if (!hashedPassword) {
    throw new Error('Hashed password is required for verification');
  }

  const isMatch = await bcrypt.compare(plainPassword, hashedPassword);

  return isMatch;
};
