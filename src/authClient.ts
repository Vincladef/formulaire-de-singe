import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
export const authClient = authUrl
  ? createAuthClient(authUrl, { adapter: BetterAuthReactAdapter() })
  : null;

function isJwt(value: unknown): value is string {
  return typeof value === 'string'
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Get the short-lived JWT for our server-side API, never the opaque session cookie.
 * This installed Neon Auth SDK exposes token(); on some versions, its cache
 * can miss the JWT after a Google callback. Retry using Neon Auth's official
 * managed GET /token endpoint with its HTTP-only session cookie.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!authClient || !authUrl) return null;

  try {
    const result = await authClient.token();
    if (isJwt(result.data?.token)) return result.data.token;
  } catch {
    // Fall back to the managed token endpoint instead of treating a valid
    // browser session as expired due to a transient SDK/cache failure.
  }

  try {
    const response = await fetch(`${authUrl.replace(/\/+$/, '')}/token`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'token' in body && isJwt(body.token)) {
      return body.token;
    }
  } catch {
    // Network/cookie/browser failure. The caller shows a recovery action.
  }
  return null;
}
