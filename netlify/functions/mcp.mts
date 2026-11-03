import type { Config } from '@netlify/functions';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireUser, UnauthorizedError } from '../../src/server/auth';
import { OAuthFault, verifyOAuthAccessToken } from '../../src/server/mcpOAuthService';
import { buildMcpServer } from '../../src/server/mcpServer';
import { FormActions } from '../../src/server/formActions';
import { McpFormActions } from '../../src/server/mcpFormActions';

type McpIdentity={userId:string|null;scopes?:string[]};
export type McpIdentityProvider=(request:Request)=>Promise<McpIdentity>;
const authChallenge='Bearer realm="Monk Form", resource_metadata="https://monk-form.netlify.app/.well-known/oauth-protected-resource"';

/** Accept short-lived Neon Auth JWT for existing internal clients, or scoped opaque
 * OAuth tokens issued through explicit consent. ChatGPT never receives a Neon JWT.
 */
export async function resolveMcpIdentity(req:Request):Promise<McpIdentity>{
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return {userId:null};
 if(/^[A-Za-z0-9_-]{43}$/.test(token)){
  const verified=await verifyOAuthAccessToken(token);
  return {userId:verified.userId,scopes:verified.scopes};
 }
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw new UnauthorizedError();
 return {userId:await requireUser(req)};
}

export function createMcpHandler(
 identity:McpIdentityProvider=resolveMcpIdentity,
 actions=new FormActions(),
 workflow=new McpFormActions(actions),
){
 return async function handler(req:Request):Promise<Response>{
  if(req.method!=='POST')return new Response('Method not allowed',{
   status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  if(Number(req.headers.get('content-length')??'0')>500000)return new Response('Payload too large',{status:413});
  let identityResult:McpIdentity;
  try{identityResult=await identity(req);}
  catch(error){
   const unauthorized=error instanceof UnauthorizedError||error instanceof OAuthFault&&error.status===401;
   return new Response(unauthorized?'Unauthorized':'Authentication unavailable',{
    status:unauthorized?401:503,
    headers:{'Cache-Control':'no-store','WWW-Authenticate':authChallenge},
   });
  }
  const userId=identityResult.userId;
  const server=buildMcpServer(userId,actions,workflow,{
   linked:!!userId,scopes:identityResult.scopes,
  });
  const transport=new WebStandardStreamableHTTPServerTransport({
   sessionIdGenerator:undefined,enableJsonResponse:true,
  });
  await server.connect(transport);
  const response=await transport.handleRequest(req);
  response.headers.set('Cache-Control','no-store');
  response.headers.set('X-Content-Type-Options','nosniff');
  if(!userId)response.headers.set('WWW-Authenticate',authChallenge);
  return response;
 };
}
export default createMcpHandler();
export const config:Config={
 path:'/mcp',method:['POST'],
 rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:60},
};
