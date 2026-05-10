/**
 * Single-flight refresh helper.
 *
 * Used by the api client's 401 hook. If multiple requests 401 at the same
 * time, only one POST to /api/auth/refresh is in flight; all callers wait
 * on the same promise. Avoids the api client here on purpose — importing
 * `api` from this file would create a refresh→api→refresh cycle since
 * the api client is what calls this helper.
 */
import { env } from '@/config/env';
import { endpoints } from '@/lib/endpoints';

let inflight: Promise<boolean> | null = null;

export function runRefresh(): Promise<boolean> {
  if (inflight) return inflight;

  const url = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}${endpoints.auth.refresh}`;

  inflight = fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
