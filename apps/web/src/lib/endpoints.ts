/**
 * Single source of truth for every backend API path.
 *
 * Every feature slice imports paths from this module — never hardcodes a
 * URL. This isolates backend route quirks (see the `/rfp/` note below) to
 * a single line we can flip when the backend ships a fix.
 */
export const endpoints = {
  auth: {
    register: '/api/no-auth/user/register',
    verifyOtpRegister: '/api/no-auth/user/verify-otp-for-registration',
    login: '/api/no-auth/user/login',
    forgotPassword: '/api/no-auth/user/forgot-password',
    forgotPasswordVerifyOtp: '/api/no-auth/user/forgot-password-verify-otp',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    resetPassword: '/api/auth/reset-password',
    profile: '/api/no-auth/user/profile', // backend stub — see CLAUDE.md
  },
  supplier: {
    list: '/api/supplier/',
    create: '/api/supplier/',
    detail: (id: number) => `/api/supplier/${id}`,
    edit: (id: number) => `/api/supplier/${id}/edit`,
    toggleActive: (id: number) => `/api/supplier/${id}/active-inactive`,
    delete: (id: number) => `/api/supplier/${id}`,
  },
  // KNOWN BACKEND BUG: RFP routes mounted at /rfp/ not /api/rfp/.
  // Single line to flip when backend ships the fix.
  rfp: {
    list: '/rfp/',
    create: '/rfp/',
    detail: (id: number) => `/rfp/${id}`,
  },
  template: {
    list: '/api/template/',
    detail: (id: number) => `/api/template/${id}`,
  },
  admin: {
    inboundUnmatched: '/api/admin/inbound/unmatched',
    inboundDetail: (id: number) => `/api/admin/inbound/${id}`,
    inboundManualMatch: (id: number) => `/api/admin/inbound/${id}/manual-match`,
  },
} as const;
