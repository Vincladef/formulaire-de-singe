/** Resource-server side of the MANAGED Neon Auth OAuth 2.1 flow.
 * No hand-rolled authorization, refresh tokens, cookies or OAuth code exchange.
 * Only Neon-issued, resource-bound access JWTs may reach the MCP tools.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UnauthorizedError } from './auth';

const configuredResource = () => process.env.MCP_RESOURCE ?? 'https://formulaire-de-singe.netlify.app/mcp';
const issuerUrl = () => process.env.NEON_AUTH_URL;
const jwksUrl = () => process.env.NEON_AUTH_JWKS_URL;
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
let keyLocation = '';

export function protectedResourceMetadata() {
  const resource = configuredResource();
  const issuer = issuerUrl();
  if (!issuer) throw new Error('NEON_AUTH_URL must be configured');
  return { resource, authorization_servers: [issuer], bearer_methods_supported: ['header'] };
}

export function oauthChallenge() {
  const resource = new URL(configuredResource());
  const metadata = new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin).href;
  return `Bearer resource_metadata="${metadata}"`;
}

export async function requireMcpUser(req: Request): Promise<string> {
  const auth = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!auth) throw new UnauthorizedError();
  const issuer = issuerUrl();
  const jwks = jwksUrl();
  if (!issuer || !jwks) throw new Error('MCP authentication not configured');
  const audience = configuredResource();
  if (new URL(audience).protocol !== 'https:') throw new Error('MCP_RESOURCE must use HTTPS');
  if (keyLocation !== jwks || !keys) { keys = createRemoteJWKSet(new URL(jwks)); keyLocation = jwks; }
  try {
    const { payload } = await jwtVerify(auth, keys, {
      issuer,
      audience,
      algorithms: ['EdDSA'],
      clockTolerance: '5 seconds',
    });
    // A DPoP-bound bearer token without a DPoP proof cannot be accepted.
    // DPoP clients require an OAuth-aware resource verifier with a durable replay store.
    if (!payload.sub || typeof payload.sub !== 'string' || payload.cnf) throw new UnauthorizedError();
    return payload.sub;
  } catch { throw new UnauthorizedError(); }
}
