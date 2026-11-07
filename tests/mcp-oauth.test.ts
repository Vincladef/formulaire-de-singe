import { describe,expect,it,vi } from 'vitest';
import {
 MONK_RESOURCE,oauthParamsSchema,opaqueToken,tokenHash,pkceChallenge,
 validateOAuthParams,verifyClientId,verifyClientMetadata,verifyPkce,
} from '../src/server/mcpOAuthRules';
import { createMcpOAuthHandler } from '../src/server/mcpOAuthRestApi';

const params={
 response_type:'code',client_id:'https://chatgpt.com/oauth/client.json',
 redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',
 state:'random-oauth-state-12345',code_challenge:'A'.repeat(43),
 code_challenge_method:'S256',scope:'forms:read forms:write forms:publish',
 resource:MONK_RESOURCE,
};
const handler=createMcpOAuthHandler(async req=>{
 if(req.headers.get('authorization')==='Bearer test-jwt')return 'private-owner';
 throw new (await import('../src/server/auth')).UnauthorizedError();
});
describe('OAuth 2.1 ChatGPT / Monk Form',()=>{
 it('exposes both protected-resource and authorization-server metadata without leaking account data',async()=>{
  const res=await handler(new Request('https://monk-form.netlify.app/.well-known/oauth-protected-resource'));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.resource).toBe(MONK_RESOURCE);
  expect(body.authorization_servers).toContain('https://monk-form.netlify.app');
  const other=await handler(new Request('https://monk-form.netlify.app/.well-known/oauth-authorization-server'));
  const metadata=await other.json();
  expect(metadata.code_challenge_methods_supported).toContain('S256');
  expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
  expect(metadata.client_id_metadata_document_supported).toBe(true);
 });
 it('opens our own consent page with a valid PKCE request, not a third-party redirect',async()=>{
  const request=new Request('https://monk-form.netlify.app/oauth/authorize?'+new URLSearchParams(params).toString(),{redirect:'manual'});
  const response=await handler(request);
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toContain('/autoriser-chatgpt?');
  expect(response.headers.get('location')).not.toContain('https://chatgpt.com/connector_platform_oauth_redirect');
 });
 it('rejects open redirect and other unauthorized client metadata origins',()=>{
  expect(verifyClientId('https://chatgpt.com/oauth/client.json')).toBe(true);
  expect(verifyClientId('https://chatgpt.com/oauth/12345678-1234-1234-1234-123456789abc/client.json')).toBe(true);
  expect(verifyClientId('https://evil.example.com/oauth/client.json')).toBe(false);
  expect(verifyClientId('https://chatgpt.com.evil.example/oauth/client.json')).toBe(false);
  expect(()=>validateOAuthParams({...params,client_id:'https://evil.example.com/oauth/client.json'})).toThrow();
  expect(()=>validateOAuthParams({...params,resource:'https://other-site.example/mcp'})).toThrow();
  expect(()=>validateOAuthParams({...params,code_challenge_method:'plain'})).toThrow();
  expect(()=>validateOAuthParams({...params,scope:'forms:admin'})).toThrow();
 });
 it('verifies the redirect URI against ChatGPT published client metadata',async()=>{
  const fetcher=vi.fn(async()=>Response.json({
   client_id:params.client_id,
   redirect_uris:[params.redirect_uri],
   token_endpoint_auth_method:'none',
  }));
  expect(await verifyClientMetadata(oauthParamsSchema.parse(params),fetcher as unknown as typeof fetch)).toBe(true);
  expect(fetcher).toHaveBeenCalledWith(params.client_id,expect.objectContaining({redirect:'error'}));
  // Current ChatGPT CIMD publishes both 'none' and 'private_key_jwt', but its
  // legacy singular preference may point to private_key_jwt.
  const currentChatGPT=vi.fn(async()=>Response.json({
   client_id:params.client_id,redirect_uris:[params.redirect_uri],
   token_endpoint_auth_methods_supported:['none','private_key_jwt'],
   token_endpoint_auth_method:'private_key_jwt',
  }));
  expect(await verifyClientMetadata(oauthParamsSchema.parse(params),currentChatGPT as unknown as typeof fetch)).toBe(true);
  const signedOnly=vi.fn(async()=>Response.json({
   client_id:params.client_id,redirect_uris:[params.redirect_uri],
   token_endpoint_auth_methods_supported:['private_key_jwt'],
   token_endpoint_auth_method:'none',
  }));
  expect(await verifyClientMetadata(oauthParamsSchema.parse(params),signedOnly as unknown as typeof fetch)).toBe(false);
  const fake=vi.fn(async()=>Response.json({client_id:params.client_id,redirect_uris:['https://attacker.invalid/callback']}));
  expect(await verifyClientMetadata(oauthParamsSchema.parse(params),fake as unknown as typeof fetch)).toBe(false);
 });
 it('creates collision-resistant opaque tokens and uses real S256 PKCE hashing',()=>{
  const token=opaqueToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(tokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(tokenHash(token)).not.toContain(token);
  const verifier='a'.repeat(48);
  const challenge=pkceChallenge(verifier);
  expect(verifyPkce(verifier,challenge)).toBe(true);
  expect(verifyPkce('b'.repeat(48),challenge)).toBe(false);
  expect(verifyPkce('short',challenge)).toBe(false);
 });
 it('rejects unauthenticated consent, token grants without form body and unsupported methods',async()=>{
  const consent=await handler(new Request('https://monk-form.netlify.app/api/mcp/consent',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://monk-form.netlify.app'},
   body:JSON.stringify({params}),
  }));
  expect(consent.status).toBe(401);
  const bad=await handler(new Request('https://monk-form.netlify.app/oauth/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:'grant_type=client_credentials',
  }));
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toBe('unsupported_grant_type');
 });
});
