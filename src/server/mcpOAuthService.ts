import { sql } from 'drizzle-orm';
import { getDb } from './db/client';
import {
 MONK_RESOURCE, MONK_ISSUER, opaqueToken, tokenHash, validateOAuthParams,
 verifyClientMetadata, verifyClientId, verifyPkce,
} from './mcpOAuthRules';

export class OAuthFault extends Error{
 constructor(message:string,public status=400,public code='invalid_request'){super(message);}
}
type CodeRow={
 owner_id:string;client_id:string;redirect_uri:string;code_challenge:string;
 scope:string;resource:string;
};
type TokenRow={owner_id:string;client_id:string;scope:string;resource:string};
const asRows=<T>(result:{rows:unknown[]})=>result.rows as T[];
const codeTtlMinutes=5;
const accessTtlSeconds=3600;

function bearerError(message:string):never{throw new OAuthFault(message,401,'invalid_token');}
function validateToken(value:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(value))bearerError('Format de jeton invalide.');
}
export async function issueOAuthCode(ownerId:string,parameters:unknown,fetcher:typeof fetch=fetch){
 const params=validateOAuthParams(parameters as Record<string,unknown>);
 if(!await verifyClientMetadata(params,fetcher))
  throw new OAuthFault('Impossible de confirmer l’identité OAuth de ChatGPT ou son URL de retour.');
 const code=opaqueToken();
 await getDb().execute(sql`INSERT INTO fs_mcp_oauth_codes
  (code_hash,owner_id,client_id,redirect_uri,code_challenge,scope,resource,expires_at)
  VALUES (${tokenHash(code)},${ownerId},${params.client_id},${params.redirect_uri},
   ${params.code_challenge},${params.scope.trim()},${MONK_RESOURCE},
   now() + interval '5 minutes')`);
 const redirect=new URL(params.redirect_uri);
 redirect.searchParams.set('code',code);
 redirect.searchParams.set('state',params.state);
 return {redirectUrl:redirect.toString(),expiresIn:codeTtlMinutes*60};
}
function responseTokens(access:string,refresh:string,scope:string){
 return {access_token:access,token_type:'Bearer',expires_in:accessTtlSeconds,
  refresh_token:refresh,scope};
}
export async function exchangeOAuthCode(input:{
 code:string;client_id:string;redirect_uri:string;code_verifier:string;resource?:string;
}){
 if(!verifyClientId(input.client_id))throw new OAuthFault('Client non autorisé.',401,'invalid_client');
 if(input.resource&&input.resource!==MONK_RESOURCE)throw new OAuthFault('Ressource non autorisée.');
 validateToken(input.code);
 const db=getDb(),hash=tokenHash(input.code);
 const result=await db.execute(sql`SELECT owner_id,client_id,redirect_uri,code_challenge,scope,resource
  FROM fs_mcp_oauth_codes WHERE code_hash=${hash} AND expires_at>now() LIMIT 1`);
 const record=asRows<CodeRow>(result)[0];
 if(!record)throw new OAuthFault('Code expiré ou déjà utilisé.',400,'invalid_grant');
 if(record.client_id!==input.client_id||record.redirect_uri!==input.redirect_uri
  ||record.resource!==MONK_RESOURCE||!verifyPkce(input.code_verifier,record.code_challenge))
  throw new OAuthFault('Code ou vérification PKCE invalide.',400,'invalid_grant');
 // An atomic DELETE prevents concurrent replays of a valid authorization code.
 const used=await db.execute(sql`DELETE FROM fs_mcp_oauth_codes
  WHERE code_hash=${hash} AND expires_at>now() RETURNING owner_id,client_id,scope,resource`);
 const consumed=asRows<TokenRow>(used)[0];
 if(!consumed)throw new OAuthFault('Code déjà utilisé.',400,'invalid_grant');
 const access=opaqueToken(),refresh=opaqueToken();
 await db.execute(sql`INSERT INTO fs_mcp_oauth_tokens
  (access_hash,refresh_hash,owner_id,client_id,scope,resource,expires_at,refresh_expires_at)
  VALUES (${tokenHash(access)},${tokenHash(refresh)},${consumed.owner_id},
   ${consumed.client_id},${consumed.scope},${consumed.resource},
   now() + interval '1 hour',now() + interval '30 days')`);
 return responseTokens(access,refresh,consumed.scope);
}
export async function rotateOAuthRefresh(input:{refresh_token:string;client_id:string;resource?:string}){
 if(!verifyClientId(input.client_id))throw new OAuthFault('Client non autorisé.',401,'invalid_client');
 if(input.resource&&input.resource!==MONK_RESOURCE)throw new OAuthFault('Ressource incorrecte.');
 validateToken(input.refresh_token);
 const access=opaqueToken(),refresh=opaqueToken();
 const result=await getDb().execute(sql`UPDATE fs_mcp_oauth_tokens SET
  access_hash=${tokenHash(access)},refresh_hash=${tokenHash(refresh)},
  expires_at=now() + interval '1 hour',refresh_expires_at=now() + interval '30 days'
  WHERE refresh_hash=${tokenHash(input.refresh_token)} AND client_id=${input.client_id}
  AND resource=${MONK_RESOURCE} AND refresh_expires_at>now() AND revoked_at IS NULL
  RETURNING owner_id,client_id,scope,resource`);
 const token=asRows<TokenRow>(result)[0];
 if(!token)throw new OAuthFault('Jeton de renouvellement expiré ou révoqué.',400,'invalid_grant');
 return responseTokens(access,refresh,token.scope);
}
/** Lookup a random opaque access token by hash; scopes are never trusted from the client. */
export async function verifyOAuthAccessToken(token:string){
 validateToken(token);
 const result=await getDb().execute(sql`SELECT owner_id,scope,client_id FROM fs_mcp_oauth_tokens
   WHERE access_hash=${tokenHash(token)} AND resource=${MONK_RESOURCE}
   AND expires_at>now() AND refresh_expires_at>now() AND revoked_at IS NULL LIMIT 1`);
 const row=asRows<{owner_id:string;scope:string;client_id:string}>(result)[0];
 if(!row)bearerError('Jeton expiré ou révoqué.');
 return {userId:row.owner_id,scopes:row.scope.split(' '),clientId:row.client_id};
}
export async function getOAuthConnections(userId:string){
 const rows=await getDb().execute(sql`SELECT id,client_id,scope,created_at,refresh_expires_at,revoked_at
  FROM fs_mcp_oauth_tokens WHERE owner_id=${userId}
   AND refresh_expires_at>now() AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 30`);
 return asRows<{id:string;client_id:string;scope:string;created_at:Date;refresh_expires_at:Date}>(rows)
  .map(r=>({id:r.id,clientId:r.client_id,scopes:r.scope.split(' '),
   createdAt:new Date(r.created_at).toISOString(),expiresAt:new Date(r.refresh_expires_at).toISOString()}));
}
export async function revokeOAuthConnection(userId:string,id:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new OAuthFault('Identifiant invalide.');
 const result=await getDb().execute(sql`UPDATE fs_mcp_oauth_tokens SET revoked_at=now()
  WHERE id=${id}::uuid AND owner_id=${userId} AND revoked_at IS NULL RETURNING id`);
 if(!asRows<{id:string}>(result).length)throw new OAuthFault('Connexion introuvable.',404,'not_found');
 return {revoked:true};
}
export function oauthProtectedMetadata(){
 return {resource:MONK_RESOURCE,authorization_servers:[MONK_ISSUER],
  scopes_supported:['forms:read','forms:write','forms:publish','offline_access'],
  bearer_methods_supported:['header'],resource_name:'Monk Form'};
}
export function oauthServerMetadata(){
 return {issuer:MONK_ISSUER,authorization_endpoint:MONK_ISSUER+'/oauth/authorize',
  token_endpoint:MONK_ISSUER+'/oauth/token',
  response_types_supported:['code'],
  grant_types_supported:['authorization_code','refresh_token'],
  token_endpoint_auth_methods_supported:['none'],
  code_challenge_methods_supported:['S256'],
  scopes_supported:['forms:read','forms:write','forms:publish','offline_access'],
  client_id_metadata_document_supported:true};
}
