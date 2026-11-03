import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireUser, UnauthorizedError } from './auth';
import { assertSheetOwner, createGoogleSpreadsheet, disconnectSheets, exchangeGoogleCode, getSheetsStatus, resetFailedSheets, saveGoogleConnection, saveComposioConnection, sheetsConfigured, legacySheetsConfigured, syncGoogleSheets } from './sheetsService';
import { composioConfigured, activeAccounts, startComposioGoogle, completeComposioGoogle,createComposioSpreadsheet } from './composioService';

const json=(data:unknown,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...headers}});
const COOKIE='monk_google_oauth_state';
const MANAGED_COOKIE='monk_managed_sheets_state',SESSION_COOKIE='monk_managed_sheets_uri';
const managedRoot='/api/integrations/google/composio';
function stateSecret(){const key=process.env.GOOGLE_SHEETS_STATE_SECRET;if(!key||key.length<32)throw new Error('Secret OAuth absent ou trop court');return key;}
function signState(payload:{formId:string;userId:string;exp:number;nonce:string},secret=stateSecret()){
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const sig=createHmac('sha256',secret).update(encoded).digest('base64url');
 return encoded+'.'+sig;
}
function parseState(encoded:string,secret=stateSecret()){
 const [body,sig]=encoded.split('.');
 if(!body||!sig)throw new Error('État OAuth invalide');
 const expected=createHmac('sha256',secret).update(body).digest();
 const actual=Buffer.from(sig,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Signature OAuth invalide');
 const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as {formId?:string;userId?:string;exp?:number;nonce?:string};
 if(!data.formId||!data.userId||!data.exp||data.exp<Date.now()||data.exp>Date.now()+600_000||!data.nonce)throw new Error('Demande OAuth expirée');
 return {formId:data.formId,userId:data.userId};
}
function getCookie(request:Request,name:string){
 return (request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)??'';
}
export async function sheetsRestHandler(request:Request,onConnected?:(formId:string)=>void):Promise<Response>{
 const url=new URL(request.url),path=url.pathname;
 // Composio project callback verifier: refuse to attach an external account
 // before the returning person proves their Monk Form identity with a bearer JWT.
 if(path===managedRoot+'/verify'&&request.method==='GET'){
  const initial=getCookie(request,MANAGED_COOKIE);
  const sessionUri=url.searchParams.get('session_uri');
  if(!initial||!sessionUri||sessionUri.length>3000)
   return new Response(null,{status:303,headers:{Location:new URL('/studio?google=error',url.origin).toString()}});
  const headers=new Headers({Location:new URL('/studio?google=verifying',url.origin).toString(),'Cache-Control':'no-store'});
  headers.append('Set-Cookie',SESSION_COOKIE+'='+encodeURIComponent(sessionUri)+'; Path='+managedRoot+'/complete; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  return new Response(null,{status:303,headers});
 }
 if(path===managedRoot+'/complete'&&request.method==='POST'){
  const clearA=MANAGED_COOKIE+'=; Path='+managedRoot+'; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  const clearB=SESSION_COOKIE+'=; Path='+managedRoot+'/complete; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  try{
   const userId=await requireUser(request);
   const signed=getCookie(request,MANAGED_COOKIE);
   const sessionUri=decodeURIComponent(getCookie(request,SESSION_COOKIE));
   if(!composioConfigured()||!signed||!sessionUri)throw new Error('Autorisation Google absente ou expirée.');
   const state=parseState(signed,process.env.COMPOSIO_API_KEY!);
   if(state.userId!==userId)throw new Error('Session Google liée à un autre utilisateur.');
   const form=await assertSheetOwner(userId,state.formId);
   // Composio validates the user ID BEFORE activating the OAuth connection.
   const accountId=await completeComposioGoogle(userId,sessionUri);
   const sheetId=await createComposioSpreadsheet(userId,accountId,form.title);
   await saveComposioConnection(state.formId,userId,sheetId,accountId);
   onConnected?.(state.formId);
   const headers=new Headers({'Cache-Control':'no-store'});
   headers.append('Set-Cookie',clearA);headers.append('Set-Cookie',clearB);
   return json({ok:true,data:{connected:true,formId:state.formId}},200,headers);
  }catch(error){
   console.error('Composio Google callback',error instanceof Error?error.name:'Unknown');
   // Keep credentials out of error responses; the user can retry from the Studio.
   return json({ok:false,error:{message:'Connexion Google Sheets non terminée. Réessayez depuis le formulaire.'}},503);
  }
 }
 if(path==='/api/integrations/google/callback'){
  const clear=COOKIE+'=; Path=/api/integrations/google/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  let outcome='error',returnFormId:string|null=null;
  try{
   const state=url.searchParams.get('state')??'';
   const supplied=getCookie(request,COOKIE);
   if(!state||!supplied||state!==supplied)throw new Error('Session OAuth différente');
   const {formId,userId}=parseState(state);
   returnFormId=formId;
   const code=url.searchParams.get('code');
   if(!code)throw new Error('Connexion Google annulée');
   const form=await assertSheetOwner(userId,formId);
   const token=await exchangeGoogleCode(code);
   const id=await createGoogleSpreadsheet(token.access,form.title);
   await saveGoogleConnection(formId,userId,id,token.refresh);
   outcome='connected';
   onConnected?.(formId);
  }catch(error){console.error('Google callback failure',error instanceof Error?error.name:'Unknown');}
  const dest=new URL('/studio',url.origin);dest.searchParams.set('google',outcome);
  if(returnFormId)dest.searchParams.set('google_form',returnFormId);
  return new Response(null,{status:303,headers:{Location:dest.toString(),'Set-Cookie':clear,'Cache-Control':'no-store'}});
 }
 try{
  const userId=await requireUser(request);
  const match=path.match(/^\/api\/integrations\/google\/([0-9a-f-]{36})(?:\/(start|retry|sync))?\/?$/i);
  if(!match)return json({ok:false,error:{message:'Introuvable'}},404);
  const formId=match[1],operation=match[2];
  if(request.method==='GET'&&!operation)return json({ok:true,data:await getSheetsStatus(userId,formId)});
  if(request.method==='POST'&&operation==='start'){
   if(!sheetsConfigured())return json({ok:false,error:{message:'Connexion Google Sheets provisoirement indisponible.'}},503);
   const form=await assertSheetOwner(userId,formId);
   if(composioConfigured()){
    const accounts=await activeAccounts(userId);
    if(accounts[0]){
     // One prior consent per user can create a fresh sheet for another form.
     const id=await createComposioSpreadsheet(userId,accounts[0].id,form.title);
     await saveComposioConnection(formId,userId,id,accounts[0].id);
     onConnected?.(formId);
     return json({ok:true,data:{connected:true}},200);
    }
    const state=signState({formId,userId,exp:Date.now()+10*60_000,nonce:randomBytes(16).toString('hex')},process.env.COMPOSIO_API_KEY!);
    const callback=new URL(managedRoot+'/verify',url.origin).toString();
    const authorizationUrl=await startComposioGoogle(userId,callback);
    const cookie=MANAGED_COOKIE+'='+state+'; Path='+managedRoot+'; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
    return json({ok:true,data:{authorizationUrl}},200,{'Set-Cookie':cookie});
   }
   if(!legacySheetsConfigured())return json({ok:false,error:{message:'Connexion Google Sheets indisponible.'}},503);
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
  if(request.method==='POST'&&operation==='sync'){
   const status=await getSheetsStatus(userId,formId);
   if(!status.connected)return json({ok:false,error:{message:'Connectez Google Sheets avant de synchroniser.'}},409);
   const result=await syncGoogleSheets(20,formId);
   return json({ok:true,data:result});
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
