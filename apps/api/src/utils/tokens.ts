import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './errors';

export interface TokenPayload {
  userId: number;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  
  const token = jwt.sign(
    payload, // Data to encode in token
    env.JWT_ACCESS_TOKEN_SECRET, // Secret key for signing
    {
      expiresIn: env.JWT_ACCESS_TOKEN_EXPIRATION, // How long token is valid
      issuer: 'rfp-system', // Who issued the token
      audience: 'rfp-system-api', // Who can use the token
    }
  );

  return token;
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(
      token,
      env.JWT_ACCESS_TOKEN_SECRET,
      {
        issuer: 'rfp-system',
        audience: 'rfp-system-api',
      }
    ) as TokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(401, 'Invalid access token');
    }
    throw error;
  }
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const token = jwt.sign(
    payload,
    env.JWT_REFRESH_TOKEN_SECRET, // Different secret!
    {
      expiresIn: env.JWT_REFRESH_TOKEN_EXPIRATION, // Longer expiry
      issuer: 'rfp-system',
      audience: 'rfp-system-api',
    }
  );

  return token;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(
      token,
      env.JWT_REFRESH_TOKEN_SECRET, // Different secret!
      {
        issuer: 'rfp-system',
        audience: 'rfp-system-api',
      }
    ) as TokenPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Refresh token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    throw error;
  }
};
export const generateTokenPair = (payload: TokenPayload): TokenPair => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
  };
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    // jwt.decode() only decodes, doesn't verify
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded;
  } catch (error) {
    return null;
  }
};


export const refreshTokens = async (refreshToken: string): Promise<TokenPair> => {
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  let payload: TokenPayload;
  
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new ApiError(401, 'Token refresh failed. Please log in again.');
  }

  const newTokens = generateTokenPair({
    userId: payload.userId,
    email: payload.email,
  });

  return newTokens;
};
