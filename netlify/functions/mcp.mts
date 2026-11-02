import type { Config } from '@netlify/functions';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { UnauthorizedError } from '../../src/server/auth';
import { requireMcpUser, protectedResourceMetadata, oauthChallenge } from '../../src/server/mcpAuth';
import type { IdentityProvider } from '../../src/server/restApi';
import { buildMcpServer } from '../../src/server/mcpServer';
import { FormActions } from '../../src/server/formActions';
import type { ResultsService } from '../../src/server/resultsRepository';
import type { AudioService } from '../../src/server/audioService';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** OAuth authorization is handled by Neon Auth, not by this API. */
export function createMcpHandler(
  identity: IdentityProvider = requireMcpUser,
  actions = new FormActions(),
  services?: {results?:ResultsService;audio?:AudioService},
) {
 return async (req:Request):Promise<Response> => {
   const path=new URL(req.url).pathname;
   if (path.startsWith('/.well-known/oauth-protected-resource')) {
     if (req.method!=='GET') return new Response('Method not allowed', {status:405,headers:noStore});
     try{return Response.json(protectedResourceMetadata(),{headers:{...noStore,'Content-Type':'application/json'}});}
     catch{return Response.json({error:'Authentication unavailable'},{status:503,headers:noStore});}
   }
   if(path!=='/mcp')return new Response('Not found',{status:404,headers:noStore});
   if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:{...noStore,Allow:'POST'}});
   let userId:string;
   try{userId=await identity(req);if(!userId)throw new UnauthorizedError();}
   catch(err){
     if(!(err instanceof UnauthorizedError))return Response.json({error:'Authentication unavailable'},{status:503,headers:noStore});
     return Response.json({jsonrpc:'2.0',error:{code:-32001,message:'Authentication required'},id:null},{status:401,headers:{...noStore,'WWW-Authenticate':oauthChallenge()}});
   }
   const server=buildMcpServer(userId,actions,services);
   const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   await server.connect(transport);
   const response=await transport.handleRequest(req);
   response.headers.set('Cache-Control','no-store');
   return response;
 };
}
export default createMcpHandler();
export const config:Config={
 path:['/mcp','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],
 method:['GET','POST'],rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:60},
};
