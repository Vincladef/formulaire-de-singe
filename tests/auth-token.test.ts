import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { token, createAuthClient } = vi.hoisted(() => {
  const token = vi.fn();
  return { token, createAuthClient: vi.fn(() => ({ token })) };
});
vi.mock('@neondatabase/auth', () => ({ createAuthClient }));
vi.mock('@neondatabase/auth/react/adapters', () => ({ BetterAuthReactAdapter: () => ({}) }));

const sampleJwt = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ0ZXN0In0.signature';
const base = 'https://example.neonauth.neon.tech/example/auth';

describe('JWT Neon Auth du Studio', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_NEON_AUTH_URL', base);
    vi.stubGlobal('fetch', vi.fn());
    token.mockReset();
    createAuthClient.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('utilise le JWT du SDK sans demander un nouveau jeton', async () => {
    token.mockResolvedValue({ data: { token: sampleJwt }, error: null });
    const { getAccessToken } = await import('../src/authClient');
    expect(await getAccessToken()).toBe(sampleJwt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('récupère le jeton via Neon Auth lorsque le SDK retourne null', async () => {
    token.mockResolvedValue({ data: null, error: { message: 'No JWT' } });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: sampleJwt }) } as Response);
    const { getAccessToken } = await import('../src/authClient');
    expect(await getAccessToken()).toBe(sampleJwt);
    expect(fetch).toHaveBeenCalledWith(`${base}/token`, expect.objectContaining({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }));
  });

  it('n’utilise jamais une valeur opaque à la place du JWT', async () => {
    token.mockResolvedValue({ data: { token: 'session_opaque' }, error: null });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: 'session_opaque' }) } as Response);
    const { getAccessToken } = await import('../src/authClient');
    expect(await getAccessToken()).toBeNull();
  });

  it('gère un échec réseau sans exposer d’éléments privés', async () => {
    token.mockRejectedValue(new Error('network'));
    vi.mocked(fetch).mockRejectedValue(new Error('network'));
    const { getAccessToken } = await import('../src/authClient');
    expect(await getAccessToken()).toBeNull();
  });
});
