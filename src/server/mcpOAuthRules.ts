import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const MONK_ISSUER='https://monk-form.netlify.app';
export const MONK_RESOURCE=MONK_ISSUER+'/mcp';
export const MCP_SCOPES=['forms:read','forms:write','forms:publish','offline_access'] as const;
export const oauthParamsSchema=z.object({
 response_type:z.literal('code'),
 client_id:z.string().url().max(256),
 redirect_uri:z.string().url().max(2048),
 state:z.string().min(8).max(1024),
 code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 code_challenge_method:z.literal('S256'),
 scope:z.string().min(1).max(160),
 resource:z.string().url().optional(),
});
export type OAuthParams=z.infer<typeof oauthParamsSchema>;

export function verifyClientId(clientId:string):boolean{
 // CIMD is always on ChatGPT's HTTPS origin. Do not allow user-provided hosts.
 try{
  const u=new URL(clientId);
  return u.protocol==='https:'&&u.hostname==='chatgpt.com'&&!u.search&&!u.hash
   &&/^\/oauth\/(?:[a-zA-Z0-9_-]{2,100}\/)?client\.json$/.test(u.pathname);
 }catch{return false;}
}
export function validateOAuthParams(source:Record<string,unknown>):OAuthParams{
 const input=oauthParamsSchema.parse(source);
 if(!verifyClientId(input.client_id))throw Error('Client OAuth non autorisé.');
 if(input.resource&&input.resource!==MONK_RESOURCE)throw Error('Ressource OAuth non reconnue.');
 if(new URL(input.redirect_uri).protocol!=='https:')throw Error('Redirection OAuth non sécurisée.');
 const scopes=input.scope.trim().split(/\s+/);
 if(scopes.length>8||scopes.some(s=>!MCP_SCOPES.includes(s as typeof MCP_SCOPES[number])))
  throw Error('Portées OAuth non autorisées.');
 if(new Set(scopes).size!==scopes.length)throw Error('Portées OAuth répétées.');
 return input;
}
export async function verifyClientMetadata(input:OAuthParams,fetcher:typeof fetch=fetch):Promise<boolean>{
 // No arbitrary URL fetch: verifyClientId restricts to chatgpt.com.
 if(!verifyClientId(input.client_id))return false;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),5000);
 try{
  const result=await fetcher(input.client_id,{
   headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal,
  });
  if(!result.ok)return false;
  const body:unknown=await result.json();
  if(!body||typeof body!=='object')return false;
  const meta=body as {client_id?:unknown;redirect_uris?:unknown;token_endpoint_auth_method?:unknown};
  return meta.client_id===input.client_id
   &&Array.isArray(meta.redirect_uris)
   &&meta.redirect_uris.includes(input.redirect_uri)
   &&meta.token_endpoint_auth_method!=='client_secret_basic';
 }catch{return false;}
 finally{clearTimeout(timeout);}
}
export function opaqueToken():string{return randomBytes(32).toString('base64url');}
export function tokenHash(value:string):string{return createHash('sha256').update(value).digest('hex');}
export function pkceChallenge(verifier:string):string{return createHash('sha256').update(verifier).digest('base64url');}
export function validVerifier(verifier:string):boolean{return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier);}
export function verifyPkce(verifier:string,challenge:string):boolean{
 if(!validVerifier(verifier)||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return false;
 const a=Buffer.from(pkceChallenge(verifier));
 const b=Buffer.from(challenge);
 return a.length===b.length&&timingSafeEqual(a,b);
}
