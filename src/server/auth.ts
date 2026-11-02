/** Never trust a client-provided user ID. Always verify the JWT signature and issuer. */
import { createRemoteJWKSet, jwtVerify } from 'jose';

export class UnauthorizedError extends Error { constructor() { super('Unauthorized'); } }
let cachedKeys: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedUrl: string | undefined;

export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get('authorization');
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new UnauthorizedError();
  const authUrl = process.env.NEON_AUTH_URL;
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!authUrl || !jwksUrl) throw new Error('Neon Auth server configuration missing');
  // No user-controlled issuer/JWKS URL is accepted.
  if (cachedUrl !== jwksUrl) { cachedKeys = createRemoteJWKSet(new URL(jwksUrl)); cachedUrl = jwksUrl; }
  try {
    const { payload } = await jwtVerify(token, cachedKeys!, {
      issuer: new URL(authUrl).origin,
      algorithms: ['EdDSA'],
      clockTolerance: '5 seconds',
    });
    if (!payload.sub || typeof payload.sub !== 'string') throw new UnauthorizedError();
    return payload.sub;
  } catch { throw new UnauthorizedError(); }
}
