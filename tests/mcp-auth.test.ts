import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { verifyMcpJwt } from '../src/server/mcpAuth';

const issuer = 'https://auth.example.test/neondb/auth';
const audience = 'https://formulaire-de-singe.netlify.app/mcp';

describe('Validation des JWT OAuth pour le serveur MCP', () => {
  it('accepte un JWT signé EdDSA avec issuer et audience de la ressource', async () => {
    const {publicKey,privateKey}=await generateKeyPair('EdDSA');
    const jwk=await exportJWK(publicKey);
    const keys=createLocalJWKSet({keys:[{...jwk,kid:'test-key',use:'sig',alg:'EdDSA'}]});
    const token=await new SignJWT({sub:'auth-user-123'}).setProtectedHeader({alg:'EdDSA',kid:'test-key'})
      .setIssuedAt().setIssuer(issuer).setAudience(audience).setExpirationTime('5m').sign(privateKey);
    expect(await verifyMcpJwt(token,keys,issuer,audience)).toBe('auth-user-123');
    await expect(verifyMcpJwt(token,keys,issuer,'https://other.example.test/mcp')).rejects.toThrow();
    await expect(verifyMcpJwt(token,keys,'https://wrong.example.test',audience)).rejects.toThrow();
  });
  it('refuse un jeton expiré et un jeton DPoP-bound sans preuve', async () => {
    const {publicKey,privateKey}=await generateKeyPair('EdDSA');
    const jwk=await exportJWK(publicKey);
    const keys=createLocalJWKSet({keys:[{...jwk,kid:'test-key',use:'sig',alg:'EdDSA'}]});
    const expired=await new SignJWT({sub:'user'}).setProtectedHeader({alg:'EdDSA',kid:'test-key'})
      .setIssuer(issuer).setAudience(audience).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
    await expect(verifyMcpJwt(expired,keys,issuer,audience)).rejects.toThrow();
    const bound=await new SignJWT({sub:'user',cnf:{jkt:'thumbprint'}}).setProtectedHeader({alg:'EdDSA',kid:'test-key'})
      .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    await expect(verifyMcpJwt(bound,keys,issuer,audience)).rejects.toThrow();
  });
});
