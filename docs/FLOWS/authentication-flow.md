# Authentication Flow

---

## Overview

The system uses a two-token JWT strategy:
- **Access token** (15 min) — sent on every authenticated request
- **Refresh token** (7 days) — used only to get new access tokens

Both tokens are stored as `httpOnly` cookies (XSS-safe). Clients can also send the access token as `Authorization: Bearer <token>` — the middleware checks the header first, then falls back to the cookie.

---

## Flow 1: User Registration

```
Client                          Server
  │                               │
  │  POST /api/no-auth/user/register
  │  { name, email, password }    │
  │ ─────────────────────────────►│
  │                               │
  │                    controllers/userAuth.ts → register()
  │                    utils/registration.ts
  │                    1. Validate email regex + password regex
  │                    2. sendOtp(email) [utils/opt.ts]
  │                       a. Check Redis: otp:{email}_block → 429 if blocked
  │                       b. Check Redis: otp:{email}_attempts → block if ≥ 3
  │                       c. Check Redis: otp:{email} → 400 if OTP exists (wait 1 min)
  │                       d. Generate 4-digit OTP: Math.floor(1000 + random * 9000)
  │                       e. emailService.sendOtp() → Resend API → email sent
  │                       f. Store: otp:{email} = OTP (TTL: 60s)
  │                       g. Increment: otp:{email}_attempts (TTL: 5min)
  │                               │
  │◄─────────────────────────────│
  │  201 { success: true,         │
  │        message: 'OTP sent' }  │
  │                               │
  │  POST /api/no-auth/user/verify-otp-for-registration
  │  { name, email, password, otp }
  │ ─────────────────────────────►│
  │                               │
  │                    verifyingOtpForRegistration()
  │                    1. verifyOtp(email, otp) [utils/opt.ts]
  │                       a. Check Redis: otp:{email}_block
  │                       b. Check wrong attempt count (max 3, then 1hr block)
  │                       c. Get stored OTP from Redis
  │                       d. Compare — increment wrong_attempts if mismatch
  │                       e. Delete OTP key on success
  │                    2. Hash password with bcrypt
  │                    3. userRepository.create({ name, email, password })
  │                               │
  │◄─────────────────────────────│
  │  201 { success: true,         │
  │        message: 'Registered' }│
```

**Files involved:**
- `routes/no-authUser.ts`
- `controllers/userAuth.ts` → `registerUser`, `verifyOtpForRegistrationForUser`
- `utils/registration.ts` → `register`, `verifyingOtpForRegistration`
- `utils/opt.ts` → `sendOtp`, `verifyOtp`
- `service/redisService.ts` → Redis key operations
- `service/email/emailService.ts` → `sendOtp`
- `repositories/userRepository.ts` → `create`

---

## Flow 2: Login

```
Client                          Server
  │                               │
  │  POST /api/no-auth/user/login │
  │  { email, password }          │
  │ ─────────────────────────────►│
  │                               │
  │                    controllers/userAuth.ts → loginUser()
  │                    utils/auth.ts → login(email, password)
  │                    1. userRepository.findByEmail(email)
  │                    2. bcrypt.compare(password, user.password)
  │                    3. signAccessToken({ userId, email }) → JWT (15min)
  │                    4. signRefreshToken({ userId, email }) → JWT (7d)
  │                               │
  │◄─────────────────────────────│
  │  200 + Set-Cookie:            │
  │    accessToken=<jwt> (15min, httpOnly)
  │    refreshToken=<jwt> (7d, httpOnly)
  │  { success: true, user: {...} }
```

**Files involved:**
- `controllers/userAuth.ts` → `loginUser`
- `utils/auth.ts` → `login`
- `utils/tokens.ts` → `signAccessToken`, `signRefreshToken`
- `repositories/userRepository.ts`

---

## Flow 3: Authenticated Request

```
Client                          Server
  │                               │
  │  GET /api/supplier/           │
  │  Cookie: accessToken=<jwt>    │  (or Authorization: Bearer <jwt>)
  │ ─────────────────────────────►│
  │                               │
  │                    middleware/auth.ts → authenticate()
  │                    1. Check Authorization header (Bearer token first)
  │                    2. Fall back to req.cookies.accessToken
  │                    3. verifyAccessToken(token) → decode JWT
  │                    4. Attach decoded payload to req.auth
  │                    5. Call next()
  │                               │
  │                    → Controller → Service → Repository
  │                               │
  │◄─────────────────────────────│
  │  200 { success: true, data }  │
```

---

## Flow 4: Token Refresh

```
Client                          Server
  │                               │
  │  POST /api/auth/refresh       │
  │  Cookie: refreshToken=<jwt>   │  (or body: { refreshToken: <jwt> })
  │ ─────────────────────────────►│
  │                               │
  │  NOTE: This route is registered BEFORE authenticate middleware
  │  so no valid access token is required
  │                               │
  │                    controllers/userAuth.ts → refreshToken()
  │                    utils/tokens.ts → refreshTokens()
  │                    1. Extract refreshToken from body OR cookie
  │                    2. verifyRefreshToken(token) → decode JWT
  │                    3. signAccessToken(payload) → new access token
  │                    4. signRefreshToken(payload) → new refresh token
  │                               │
  │◄─────────────────────────────│
  │  200 + Set-Cookie:            │
  │    accessToken=<new_jwt>      │
  │    refreshToken=<new_jwt>     │
```

**Files involved:**
- `app.ts` — refresh route registered before `authenticate`
- `controllers/userAuth.ts` → `refreshToken`
- `utils/tokens.ts` → `refreshTokens`

---

## Flow 5: Logout

```
Client                          Server
  │                               │
  │  POST /api/auth/logout        │
  │  (requires valid accessToken) │
  │ ─────────────────────────────►│
  │                               │
  │                    controllers/userAuth.ts → logoutUser()
  │                    1. clearCookie('accessToken')
  │                    2. clearCookie('refreshToken')
  │                               │
  │◄─────────────────────────────│
  │  200 { success: true }        │
  │  (cookies cleared)            │
```

Note: Tokens are stateless JWTs — logout only clears cookies. If a token is captured, it remains valid until it expires. There is no token blacklist.

---

## Flow 6: Forgot Password

```
POST /api/no-auth/user/forgot-password
  { email }
  → forgotPassword(email) [utils/password.ts]
  → sendOtp(email) [same rate limiting as registration]
  → 200

POST /api/no-auth/user/forgot-password-verify-otp
  { email, otp }
  → forgotPasswordVerify(email, otp)
  → verifyOtp(email, otp)
  → 200

POST /api/auth/reset-password   ← requires auth (logged-in user)
  { email, password, oldPassword?, isForgotPassword }
  → resetPassword({ email, password, oldPassword, isForgotPassword }, req.auth)
  → if isForgotPassword=false: verify oldPassword via bcrypt
  → hash new password
  → userRepository.update({ where: { email }, data: { password } })
  → 200
```

**Files involved:**
- `controllers/userAuth.ts`
- `utils/password.ts` → `forgotPassword`, `forgotPasswordVerify`, `resetPassword`
- `utils/opt.ts` → `sendOtp`, `verifyOtp`

---

## OTP Rate Limiting Details

| Scenario | Redis Key | Limit | Block Duration |
|---|---|---|---|
| Send attempts | `otp:{email}_attempts` | 3 per 5 min | 15 min (`otp:{email}_block`) |
| Wrong verifications | `otp:{email}_wrong_attempts` | 3 per 2 min | 1 hour (same key) |
| OTP validity | `otp:{email}` | — | 60 seconds TTL |
| Re-send cooldown | `otp:{email}` (exists check) | — | Wait until OTP expires (60s) |

---

## Token Configuration

| Token | Expiry | Secret env var | Storage |
|---|---|---|---|
| Access | 15 min | `JWT_ACCESS_TOKEN_SECRET` | httpOnly cookie `accessToken` + optional Bearer header |
| Refresh | 7 days | `JWT_REFRESH_TOKEN_SECRET` | httpOnly cookie `refreshToken` + optional body |

Cookies are `secure: true` in production (HTTPS only).
