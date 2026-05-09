/**
 * Centralised env config for the web app.
 *
 * Mirrors the backend rule from CLAUDE.md: never read `import.meta.env.*`
 * directly outside this file. Import `env` from `@/config/env` instead.
 *
 * All required vars are validated at module load — missing vars throw
 * synchronously so the app fails fast rather than producing confusing
 * runtime errors deep in feature code.
 */

type RawEnv = ImportMetaEnv & Record<string, string | undefined>;

function readString(source: RawEnv, key: string): string {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return raw;
}

function readBoolean(source: RawEnv, key: string): boolean {
  const raw = readString(source, key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(
    `Invalid boolean for env var ${key}: expected "true" or "false", got "${raw}"`,
  );
}

function readNumber(source: RawEnv, key: string): number {
  const raw = readString(source, key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for env var ${key}: got "${raw}"`);
  }
  return parsed;
}

const source = import.meta.env as RawEnv;

export const env = {
  VITE_API_BASE_URL: readString(source, 'VITE_API_BASE_URL'),
  VITE_FRONTEND_URL: readString(source, 'VITE_FRONTEND_URL'),
  VITE_DEFAULT_APP_ID: readNumber(source, 'VITE_DEFAULT_APP_ID'),
  VITE_SHOW_ADMIN: readBoolean(source, 'VITE_SHOW_ADMIN'),
  VITE_DELIVERY_STATUS_LIVE: readBoolean(source, 'VITE_DELIVERY_STATUS_LIVE'),
  VITE_SUPPLIER_PORTAL_LIVE: readBoolean(source, 'VITE_SUPPLIER_PORTAL_LIVE'),
} as const;

export type Env = typeof env;
