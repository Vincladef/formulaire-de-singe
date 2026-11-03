import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireUser, UnauthorizedError } from './auth';
import { assertSheetOwner, createGoogleSpreadsheet, disconnectSheets, exchangeGoogleCode, getSheetsStatus, resetFailedSheets, saveGoogleConnection, saveComposioConnection, sheetsConfigured, legacySheetsConfigured, syncGoogleSheets } from './sheetsService';
import { composioConfigured, activeAccounts, startComposioGoogle, completeComposioGoogle,createComposioSpreadsheet,prepareExistingComposioSpreadsheet } from './composioService';

const json=(data:unknown,status=200,headers?:HeadersInit)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...headers}});
const COOKIE='monk_google_oauth_state';
const MANAGED_COOKIE='monk_managed_sheets_state',SESSION_COOKIE='monk_managed_sheets_uri';
const managedRoot='/api/integrations/google/composio';
function stateSecret(){const key=process.env.GOOGLE_SHEETS_STATE_SECRET;if(!key||key.length<32)throw new Error('Secret OAuth absent ou trop court');return key;}
function signState(payload:{formId:string;userId:string;exp:number;nonce:string;accountId?:string;sheetId?:string},secret=stateSecret()){
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
 const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as {formId?:string;userId?:string;exp?:number;nonce?:string;accountId?:string;sheetId?:string};
 if(!data.formId||!data.userId||!data.exp||data.exp<Date.now()||data.exp>Date.now()+600_000||!data.nonce)throw new Error('Demande OAuth expirée');
 if(data.sheetId&&!/^[A-Za-z0-9_-]{20,150}$/.test(data.sheetId))throw new Error('Tableur Google invalide');
 return {formId:data.formId,userId:data.userId,accountId:data.accountId,sheetId:data.sheetId};
}
/** Accept a Google Sheets URL or bare document ID. Never proxy arbitrary URLs. */
function parseExistingSheetId(input:unknown):string|undefined{
 if(input===undefined||input===null)return undefined;
 if(typeof input!=='string'||input.length>1024)throw new Error('Adresse de tableur Google Sheets invalide.');
 const value=input.trim();
 if(!value)throw new Error('Indiquez le lien du tableur Google Sheets.');
 let id=value;
 if(value.includes('://')){
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('Adresse de tableur Google Sheets invalide.');}
  const match=url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,150})(?:\/|$)/);
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||!match)
   throw new Error('Indiquez un lien Google Sheets valide (docs.google.com/spreadsheets/d/…).');
  id=match[1];
 }
 if(!/^[A-Za-z0-9_-]{20,150}$/.test(id))throw new Error('Identifiant de tableur Google Sheets invalide.');
 return id;
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
  const accountId=url.searchParams.get('connected_account_id')??'';
  const status=url.searchParams.get('status');
  try{
   if(!composioConfigured()||status!=='success'||!initial)throw new Error('Connexion Google refusée.');
   const state=parseState(initial,process.env.COMPOSIO_API_KEY!);
   if(!state.accountId||accountId!==state.accountId)throw new Error('Connexion Google inattendue.');
  }catch{
   return new Response(null,{status:303,headers:{Location:new URL('/studio?google=error',url.origin).toString(),'Cache-Control':'no-store'}});
  }
  const headers=new Headers({Location:new URL('/studio?google=verifying',url.origin).toString(),'Cache-Control':'no-store'});
  headers.append('Set-Cookie',SESSION_COOKIE+'='+encodeURIComponent(accountId)+'; Path='+managedRoot+'/complete; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  return new Response(null,{status:303,headers});
 }
 if(path===managedRoot+'/complete'&&request.method==='POST'){
  const clearA=MANAGED_COOKIE+'=; Path='+managedRoot+'; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  const clearB=SESSION_COOKIE+'=; Path='+managedRoot+'/complete; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  try{
   const userId=await requireUser(request);
   const signed=getCookie(request,MANAGED_COOKIE);
   const accountId=decodeURIComponent(getCookie(request,SESSION_COOKIE));
   if(!composioConfigured()||!signed||!accountId)throw new Error('Autorisation Google absente ou expirée.');
   const state=parseState(signed,process.env.COMPOSIO_API_KEY!);
   if(state.userId!==userId||state.accountId!==accountId)throw new Error('Session Google liée à un autre utilisateur ou à un autre compte.');
   const form=await assertSheetOwner(userId,state.formId);
   // Verify the account became ACTIVE for the same owner and expected toolkit.
   await completeComposioGoogle(userId,accountId);
   const sheetId=state.sheetId??await createComposioSpreadsheet(userId,accountId,form.title);
   if(state.sheetId)await prepareExistingComposioSpreadsheet(userId,accountId,state.sheetId);
   await saveComposioConnection(state.formId,userId,sheetId,accountId);
   onConnected?.(state.formId);
   const headers=new Headers({'Cache-Control':'no-store'});
   headers.append('Set-Cookie',clearA);headers.append('Set-Cookie',clearB);
   return Response.json({ok:true,data:{connected:true,formId:state.formId}},{status:200,headers});
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
   const supplied=request.headers.get('content-type')?.includes('application/json')?await request.json().catch(()=>{throw new Error('Adresse de tableur Google Sheets invalide.');}):null;
   const raw=supplied&&typeof supplied==='object'&&'spreadsheetUrl' in supplied?supplied.spreadsheetUrl:undefined;
   const existingId=parseExistingSheetId(raw);
   if(!sheetsConfigured())return json({ok:false,error:{message:'Connexion Google Sheets provisoirement indisponible.'}},503);
   const form=await assertSheetOwner(userId,formId);
   if(composioConfigured()){
    const accounts=await activeAccounts(userId);
    if(accounts[0]){
     // Reuse the owner's existing Google consent, without another OAuth prompt.
     const id=existingId??await createComposioSpreadsheet(userId,accounts[0].id,form.title);
     if(existingId)await prepareExistingComposioSpreadsheet(userId,accounts[0].id,existingId);
     await saveComposioConnection(formId,userId,id,accounts[0].id);
     onConnected?.(formId);
     return json({ok:true,data:{connected:true}},200);
    }
    const callback=new URL(managedRoot+'/verify',url.origin).toString();
    const {authorizationUrl,expectedAccountId}=await startComposioGoogle(userId,callback);
    const state=signState({formId,userId,accountId:expectedAccountId,sheetId:existingId,
     exp:Date.now()+10*60_000,nonce:randomBytes(16).toString('hex')},process.env.COMPOSIO_API_KEY!);
    const cookie=MANAGED_COOKIE+'='+state+'; Path='+managedRoot+'; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
    return json({ok:true,data:{authorizationUrl}},200,{'Set-Cookie':cookie});
   }
   if(existingId)return json({ok:false,error:{message:'L’utilisation d’un tableur existant nécessite la connexion Google gérée.'}},409);
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
  return json({ok:false,error:{message:error instanceof Error&&/formulaire|appartient|Identifiant invalide|Google Sheets|tableur|Adresse de/.test(error.message)?error.message:'Intégration Google Sheets indisponible.'}},503);
 }
}
