import { requireUser, UnauthorizedError } from './auth';
import { MONK_ISSUER, validateOAuthParams } from './mcpOAuthRules';
import {
 issueOAuthCode, exchangeOAuthCode, rotateOAuthRefresh, oauthProtectedMetadata,
 oauthServerMetadata, getOAuthConnections, revokeOAuthConnection, OAuthFault,
} from './mcpOAuthService';

const noStore={ 'Cache-Control':'no-store, private', 'Pragma':'no-cache',
 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' };
function json(body:unknown,status=200,publicResource=false){
 return Response.json(body,{status,headers:{...noStore,
  ...(publicResource?{'Access-Control-Allow-Origin':'*'}:{})}});
}
async function readBody(req:Request,max=8192){
 if(Number(req.headers.get('content-length')||'0')>max)throw new OAuthFault('Requête trop volumineuse.',413);
 const text=await req.text();
 if(text.length>max)throw new OAuthFault('Requête trop volumineuse.',413);
 return text;
}
function browserOrigin(req:Request){
 const origin=req.headers.get('origin');
 // Browser requests include Origin. A server-side client can omit Origin but
 // still needs a valid Neon JWT. Reject any explicitly foreign origin.
 if(origin&&origin!==MONK_ISSUER)throw new OAuthFault('Origine non autorisée.',403);
}
function safeOAuthRedirect(req:Request){
 const url=new URL(req.url);
 const params=Object.fromEntries(url.searchParams.entries());
 validateOAuthParams(params);
 // Only our own page may render the user-consent UI.
 return MONK_ISSUER+'/autoriser-chatgpt?'+url.searchParams.toString();
}
export function createMcpOAuthHandler(
 identity:(req:Request)=>Promise<string>=requireUser,
){
 return async(req:Request):Promise<Response>=>{
  const url=new URL(req.url),path=url.pathname;
  try{
   if(req.method==='GET'&&(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp'))
    return json(oauthProtectedMetadata(),200,true);
   if(req.method==='GET'&&(path==='/.well-known/oauth-authorization-server'||path==='/.well-known/oauth-authorization-server/mcp'))
    return json(oauthServerMetadata(),200,true);

   if(req.method==='GET'&&path==='/oauth/authorize')
    return new Response(null,{status:302,headers:{...noStore,Location:safeOAuthRedirect(req)}});
   if(req.method==='POST'&&path==='/oauth/token'){
    if(!(req.headers.get('content-type')??'').toLowerCase().startsWith('application/x-www-form-urlencoded'))
     throw new OAuthFault('Content-Type incorrect.');
    const data=new URLSearchParams(await readBody(req));
    const grant=data.get('grant_type');
    if(grant==='authorization_code'){
     const code=data.get('code'),client_id=data.get('client_id'),redirect_uri=data.get('redirect_uri'),code_verifier=data.get('code_verifier');
     if(!code||!client_id||!redirect_uri||!code_verifier)throw new OAuthFault('Paramètres OAuth incomplets.');
     return json(await exchangeOAuthCode({code,client_id,redirect_uri,code_verifier,resource:data.get('resource')??undefined}));
    }
    if(grant==='refresh_token'){
     const refresh_token=data.get('refresh_token'),client_id=data.get('client_id');
     if(!refresh_token||!client_id)throw new OAuthFault('Renouvellement OAuth incomplet.');
     return json(await rotateOAuthRefresh({refresh_token,client_id,resource:data.get('resource')??undefined}));
    }
    throw new OAuthFault('Type de grant non pris en charge.',400,'unsupported_grant_type');
   }

   if(req.method==='POST'&&path==='/api/mcp/consent'){
    browserOrigin(req);
    if(!(req.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))
     throw new OAuthFault('Content-Type incorrect.');
    const userId=await identity(req);
    if(!userId)throw new UnauthorizedError();
    let body:unknown;
    try{body=JSON.parse(await readBody(req));}
    catch{throw new OAuthFault('JSON invalide.');}
    if(!body||typeof body!=='object'||!('params' in body))throw new OAuthFault('Demande OAuth manquante.');
    const fields=(body as {params:unknown}).params;
    return json(await issueOAuthCode(userId,fields));
   }
   if(path==='/api/mcp/connections'){
    const userId=await identity(req);
    if(req.method==='GET')return json({connections:await getOAuthConnections(userId)});
   }
   if(path.startsWith('/api/mcp/connections/')){
    if(req.method!=='DELETE')return json({error:'method_not_allowed'},405);
    browserOrigin(req);
    const userId=await identity(req);
    const id=path.slice('/api/mcp/connections/'.length);
    return json(await revokeOAuthConnection(userId,id));
   }
   return json({error:'not_found'},404);
  }catch(error){
   if(error instanceof UnauthorizedError)return json({error:'unauthorized',error_description:'Connecte-toi à Monk Form.'},401);
   if(error instanceof OAuthFault)return json({error:error.code,error_description:error.message},error.status);
   // Schema errors may include untrusted input. Do not reflect internal diagnostics.
   if(error instanceof Error&&error.name==='ZodError')return json({error:'invalid_request',error_description:'Paramètres OAuth incorrects.'},400);
   console.error('MCP OAuth error',error instanceof Error?error.name:'Unknown');
   return json({error:'server_error',error_description:'Service temporairement indisponible.'},503);
  }
 };
}
