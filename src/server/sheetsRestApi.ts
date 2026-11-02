import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireUser, UnauthorizedError } from './auth';
import { assertSheetOwner, createGoogleSpreadsheet, disconnectSheets, exchangeGoogleCode, getSheetsStatus, resetFailedSheets, saveGoogleConnection, sheetsConfigured } from './sheetsService';

const json=(data:unknown,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...headers}});
const COOKIE='monk_google_oauth_state';
function stateSecret(){const key=process.env.GOOGLE_SHEETS_STATE_SECRET;if(!key||key.length<32)throw new Error('Secret OAuth absent ou trop court');return key;}
function signState(payload:{formId:string;userId:string;exp:number;nonce:string}){
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const sig=createHmac('sha256',stateSecret()).update(encoded).digest('base64url');
 return encoded+'.'+sig;
}
function parseState(encoded:string){
 const [body,sig]=encoded.split('.');
 if(!body||!sig)throw new Error('État OAuth invalide');
 const expected=createHmac('sha256',stateSecret()).update(body).digest();
 const actual=Buffer.from(sig,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Signature OAuth invalide');
 const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as {formId?:string;userId?:string;exp?:number;nonce?:string};
 if(!data.formId||!data.userId||!data.exp||data.exp<Date.now()||data.exp>Date.now()+600_000||!data.nonce)throw new Error('Demande OAuth expirée');
 return {formId:data.formId,userId:data.userId};
}
function getCookie(request:Request,name:string){
 return (request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)??'';
}
export async function sheetsRestHandler(request:Request):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/integrations/google/callback'){
  const clear=COOKIE+'=; Path=/api/integrations/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  let outcome='error';
  try{
   const state=url.searchParams.get('state')??'';
   const supplied=getCookie(request,COOKIE);
   if(!state||!supplied||state!==supplied)throw new Error('Session OAuth différente');
   const {formId,userId}=parseState(state);
   const code=url.searchParams.get('code');
   if(!code)throw new Error('Connexion Google annulée');
   const form=await assertSheetOwner(userId,formId);
   const token=await exchangeGoogleCode(code);
   const id=await createGoogleSpreadsheet(token.access,form.title);
   await saveGoogleConnection(formId,userId,id,token.refresh);
   outcome='connected';
  }catch(error){console.error('Google callback failure',error instanceof Error?error.name:'Unknown');}
  const dest=new URL('/studio',url.origin);dest.searchParams.set('google',outcome);
  return new Response(null,{status:303,headers:{Location:dest.toString(),'Set-Cookie':clear,'Cache-Control':'no-store'}});
 }
 try{
  const userId=await requireUser(request);
  const match=path.match(/^\/api\/integrations\/google\/([0-9a-f-]{36})(?:\/(start|retry))?\/?$/i);
  if(!match)return json({ok:false,error:{message:'Introuvable'}},404);
  const formId=match[1],operation=match[2];
  if(request.method==='GET'&&!operation)return json({ok:true,data:await getSheetsStatus(userId,formId)});
  if(request.method==='POST'&&operation==='start'){
   if(!sheetsConfigured())return json({ok:false,error:{message:'Connexion Google non configurée sur le serveur.'}},503);
   await assertSheetOwner(userId,formId);
   const state=signState({formId,userId,exp:Date.now()+10*60_000,nonce:randomBytes(16).toString('hex')});
   const uri=process.env.GOOGLE_SHEETS_REDIRECT_URI!;
   const oauth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   oauth.searchParams.set('client_id',process.env.GOOGLE_SHEETS_CLIENT_ID!);
   oauth.searchParams.set('redirect_uri',uri);
   oauth.searchParams.set('response_type','code');
   oauth.searchParams.set('scope','https://www.googleapis.com/auth/spreadsheets');
   oauth.searchParams.set('access_type','offline');
   oauth.searchParams.set('prompt','consent');
   oauth.searchParams.set('state',state);
   const cookie=COOKIE+'='+state+'; Path=/api/integrations/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
   return json({ok:true,data:{authorizationUrl:oauth.toString()}},200,{'Set-Cookie':cookie});
  }
  if(request.method==='POST'&&operation==='retry'){
   await resetFailedSheets(userId,formId);
   return json({ok:true,data:{queued:true}});
  }
  if(request.method==='DELETE'&&!operation){
   await disconnectSheets(userId,formId);
   return json({ok:true,data:{disconnected:true}});
  }
  return json({ok:false,error:{message:'Méthode non autorisée'}},405);
 }catch(error){
  if(error instanceof UnauthorizedError)return json({ok:false,error:{message:'Connexion requise'}},401);
  console.error('Sheets integration error',error instanceof Error?error.name:'Unknown');
  return json({ok:false,error:{message:error instanceof Error&&/formulaire|appartient|Identifiant invalide/.test(error.message)?error.message:'Intégration Google Sheets indisponible.'}},503);
 }
}
