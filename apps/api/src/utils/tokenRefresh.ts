/**
 * ============================================
 * TOKEN REFRESH UTILITY
 * ============================================
 * 
 * WHAT THIS FILE DOES:
 * - Handles refreshing expired access tokens
 * - Uses refresh token to get new access token
 * - Validates refresh token before issuing new tokens
 * 
 * WHY WE NEED THIS:
 * - Access tokens expire quickly (15 minutes)
 * - Users shouldn't have to log in again
 * - Refresh tokens are long-lived (7 days)
 * - Allows seamless token renewal
 * 
 * TOKEN REFRESH FLOW:
 * 
 * 1. ACCESS TOKEN EXPIRES:
 *    - User makes API request
 *    - Access token is expired
 *    - Server returns 401 Unauthorized
 * 
 * 2. CLIENT DETECTS EXPIRY:
 *    - Frontend catches 401 error
 *    - Checks if refresh token exists
 *    - Calls /api/auth/refresh endpoint
 * 
 * 3. SERVER REFRESHES:
 *    - Validates refresh token
 *    - Generates new access token
 *    - Optionally generates new refresh token (rotation)
 *    - Returns new tokens
 * 
 * 4. CLIENT UPDATES:
 *    - Stores new access token
 *    - Retries original request
 *    - User continues seamlessly
 * 
 * SECURITY:
 * - Refresh token must be valid
 * - Refresh token must not be expired
 * - New tokens use same user info
 * - Can implement token rotation (invalidate old refresh token)
 */

import { verifyRefreshToken, generateTokenPair, TokenPair, TokenPayload } from './tokens';
import { ApiError } from './errors';

/**
 * refreshTokens - Refresh access token using refresh token
 * 
 * WHAT IT DOES:
 * 1. Takes refresh token from request
 * 2. Verifies refresh token is valid
 * 3. Extracts user info from refresh token
 * 4. Generates new access token (and optionally new refresh token)
 * 5. Returns new token pair
 * 
 * PARAMETERS:
 * - refreshToken: The refresh token string
 * 
 * RETURNS:
 * - New token pair (accessToken, refreshToken)
 * 
 * THROWS:
 * - ApiError(401): If refresh token is invalid or expired
 * 
 * SECURITY NOTES:
 * - Only accepts refresh tokens (not access tokens)
 * - Validates refresh token signature
 * - Checks refresh token expiration
 * - Can implement token rotation (invalidate old token)
 */
export const refreshTokens = async (refreshToken: string): Promise<TokenPair> => {
  // ============================================
  // VALIDATE REFRESH TOKEN EXISTS
  // ============================================
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  // ============================================
  // VERIFY REFRESH TOKEN
  // ============================================
  // 
  // WHAT WE'RE DOING:
  // - Verifying refresh token signature
  // - Checking expiration
  // - Extracting user info (userId, email)
  // 
  // IF INVALID:
  // - Throws error (caught below)
  // - Client must log in again
  // 
  // IF VALID:
  // - Returns TokenPayload { userId, email }
  // - We use this to generate new tokens
  let payload: TokenPayload;
  
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    // Refresh token is invalid or expired
    // User must log in again
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        throw new ApiError(401, 'Refresh token has expired. Please log in again.');
      }
      throw new ApiError(401, 'Invalid refresh token. Please log in again.');
    }
    throw new ApiError(401, 'Token refresh failed. Please log in again.');
  }

  // ============================================
  // GENERATE NEW TOKENS
  // ============================================
  // 
  // WHAT WE'RE DOING:
  // - Using same user info from refresh token
  // - Generating new access token (15 min expiry)
  // - Generating new refresh token (7 days expiry)
  // 
  // WHY NEW TOKENS:
  // - Access token expired, need new one
  // - Can optionally rotate refresh token (better security)
  // - Extends user session
  // 
  // TOKEN ROTATION (Optional):
  // - Could invalidate old refresh token
  // - Store in Redis blacklist
  // - Prevents reuse if token is stolen
  // - For now, we just generate new tokens
  const newTokens = generateTokenPair({
    userId: payload.userId,
    email: payload.email,
  });

  // ============================================
  // RETURN NEW TOKENS
  // ============================================
  // 
  // WHAT WE'RE RETURNING:
  // - New access token (short-lived)
  // - New refresh token (long-lived)
  // 
  // CLIENT USAGE:
  // - Store new access token
  // - Store new refresh token
  // - Retry original request
  return newTokens;
};
