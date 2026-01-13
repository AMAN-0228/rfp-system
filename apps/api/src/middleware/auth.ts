import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/tokens';
import { ApiError } from '../utils/errors';

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    
    let token: string | undefined;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract token from "Bearer <token>"
      token = authHeader.substring(7); // Remove "Bearer " prefix
    }
    
    // If no token in header, check cookies
    if (!token) {
      token = req.cookies?.accessToken;
    }

    if (!token) {
      throw new ApiError(
        401,
        'Authentication required. Please provide a valid access token.'
      );
    }
    const decoded = verifyAccessToken(token);

    
    req.auth = decoded;

    next();
  } catch (error) {
    
    if (error instanceof ApiError) {
      return next(error);
    }

    // If error from verifyAccessToken, convert to ApiError
    if (error instanceof Error) {
      return next(
        new ApiError(
          401,
          error.message || 'Invalid or expired access token'
        )
      );
    }

    // Unknown error
    return next(
      new ApiError(401, 'Authentication failed')
    );
  }
};
