import { ValidationError } from "./errors";
import * as userRepository from "../repositories/userRepository";
import { verifyPassword } from "./password";
import { generateTokenPair, TokenPair } from "./tokens";

export const login = async (
  email: string,
  password: string
): Promise<{
  tokens: TokenPair;
  user: {
    id: number;
    email: string;
    name: string | null;
  };
}> => {
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const user = await userRepository.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      active: true,
    },
  });

  if (!user) {
    await verifyPassword(password, '$2b$10$dummyHashToPreventTimingAttack');
    throw new ValidationError('Invalid email or password');
  }
  if (!user.active) {
    throw new ValidationError('Account is not active');
  }
  const isPasswordValid = await verifyPassword(password, user.password);

  if (!isPasswordValid) {
    throw new ValidationError('Invalid email or password');
  }

  const tokens = generateTokenPair({
    userId: user.id,
    email: user.email,
  });

  return {
    tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  };
};
