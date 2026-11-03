/**
 * Composio managed Google Sheets OAuth. All calls are server-side and limited to
 * Google Sheets or to the authenticated user's Composio connection.
 * Free Composio plans stop at their hard cap; we never enable billing or upgrades.
 * https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink
 */
const ROOT='https://backend.composio.dev/api/v3.1';
const SHEETS='https://sheets.googleapis.com/v4/spreadsheets';
// Refuse public connections until the project-wide callback identity verifier is enabled.
export const composioConfigured=()=>Boolean(process.env.COMPOSIO_API_KEY?.trim()&&process.env.COMPOSIO_OAUTH_VERIFIER_ENABLED==='true');
export const composioUserId=(neonId:string)=>'monk-form:'+neonId;

type Config={id:string;toolkit?:{slug:string};is_composio_managed?:boolean;auth_scheme?:string;is_disabled?:boolean};
type Account={id:string;user_id:string;status:string;toolkit?:{slug:string};auth_config?:{is_composio_managed?:boolean};is_disabled?:boolean};
type ApiError={error?:{message?:string}};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const key=process.env.COMPOSIO_API_KEY?.trim();
 if(!key)throw new Error('Connexion Google Sheets en cours de configuration.');
 const response=await fetch(ROOT+path,{
  method,headers:{'x-api-key':key,'Content-Type':'application/json'},
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(15000),
 });
 const payload=await response.json().catch(()=>({})) as T&ApiError;
 if(!response.ok){
  // Never expose provider internals, account details or private identifiers.
  if(response.status===429||response.status===402)
   throw new Error('Quota gratuit Google Sheets atteint. Les réponses restent en attente.');
  if(response.status===401||response.status===403)
   throw new Error('La connexion Google Sheets de l’application doit être réactivée.');
  throw new Error('Service Google Sheets temporairement indisponible ('+response.status+').');
 }
 return payload;
}
export async function authConfigId():Promise<string>{
 const explicit=process.env.COMPOSIO_GOOGLESHEETS_AUTH_CONFIG_ID?.trim();
 if(explicit)return explicit;
 const listing=await request<{items:Config[]}>('/auth_configs?toolkit_slug=googlesheets&is_composio_managed=true&limit=100');
 const matched=listing.items?.find(x=>x.toolkit?.slug==='googlesheets'&&x.is_composio_managed!==false&&!x.is_disabled);
 if(matched?.id)return matched.id;
 const created=await request<{auth_config:{id:string}}>('/auth_configs','POST',{toolkit:{slug:'googlesheets'},auth_config:{type:'use_composio_managed_auth',credentials:{},restrict_to_following_tools:[]}});
 if(!created.auth_config?.id)throw new Error('Configuration du connecteur Google Sheets impossible.');
 return created.auth_config.id;
}
export async function activeAccounts(neonId:string):Promise<Account[]>{
 const user=composioUserId(neonId);
 const q=new URLSearchParams({user_ids:user,toolkit_slugs:'googlesheets',statuses:'ACTIVE',limit:'100'});
 const listing=await request<{items:Account[]}>('/connected_accounts?'+q);
 return (listing.items??[]).filter(x=>x.user_id===user&&x.toolkit?.slug==='googlesheets'&&x.status==='ACTIVE'&&!x.is_disabled);
}
export async function startComposioGoogle(neonId:string,callback:string):Promise<{authorizationUrl:string;expectedAccountId:string}>{
 if(new URL(callback).origin!=='https://monk-form.netlify.app')
  throw new Error('URL de retour Google Sheets invalide.');
 const linked=await request<{redirect_url:string;connected_account_id:string}>('/connected_accounts/link','POST',{
  auth_config_id:await authConfigId(),
  user_id:composioUserId(neonId),
  callback_url:callback,
 });
 const url=new URL(linked.redirect_url);
 if(url.protocol!=='https:'||!(url.hostname==='composio.dev'||url.hostname.endsWith('.composio.dev')))
  throw new Error('Page d’autorisation Google Sheets invalide.');
 // The link API returns the expected connection id before OAuth; bind that ID
 // to the owner's signed session and reject any different ID on callback.
 if(!/^ca_[A-Za-z0-9_-]{2,150}$/.test(linked.connected_account_id??''))
  throw new Error('La demande de connexion Google Sheets est incomplète.');
 return {authorizationUrl:url.toString(),expectedAccountId:linked.connected_account_id};
}
/** Verify the OAuth connection created by the previously issued Connect Link. */
export async function completeComposioGoogle(neonId:string,accountId:string):Promise<string>{
 await verifyComposioAccount(neonId,accountId);
 return accountId;
}
export async function verifyComposioAccount(neonId:string,accountId:string){
 if(!/^ca_[A-Za-z0-9_-]{2,150}$/.test(accountId))throw new Error('Identifiant de connexion Google invalide.');
 const account=await request<Account>('/connected_accounts/'+encodeURIComponent(accountId));
 if(account.user_id!==composioUserId(neonId)||account.toolkit?.slug!=='googlesheets'||
    account.status!=='ACTIVE'||account.is_disabled)
  throw new Error('Ce compte Google Sheets ne correspond pas au propriétaire connecté.');
}
async function sheetsJSON<T>(neonId:string,accountId:string,url:string,method='GET',body?:unknown):Promise<T>{
 // Do not allow open proxy requests to unrelated domains.
 const parsed=new URL(url);
 if(parsed.origin!=='https://sheets.googleapis.com'||!parsed.pathname.startsWith('/v4/spreadsheets'))
  throw new Error('Destination Google Sheets non autorisée.');
 // Composio's proxy has returned two JSON shapes across API generations:
 // {status,data} and {successful:true,data:{status,data}}. A successful
 // transport response is not necessarily a successful Google API response.
 type Reply={status?:number;data?:T|{status?:number;data?:T};successful?:boolean;error?:unknown};
 const raw=await request<Reply>('/tools/execute/proxy','POST',{
  connected_account_id:accountId,user_id:composioUserId(neonId),
  endpoint:parsed.origin+parsed.pathname,method,
  ...(body!==undefined?{body}:{}),
  parameters:[...parsed.searchParams].map(([name,value])=>({name,value,in:'query'})),
 });
 const nested=raw.data&&typeof raw.data==='object'&&'status' in raw.data
  ?raw.data as {status?:number;data?:T}:null;
 const status=nested?.status??raw.status;
 const data=nested?.data??raw.data;
 if(raw.successful===false||typeof status!=='number'){
  console.error('Google Sheets proxy returned an unexpected response envelope');
  throw new Error('Réponse du service Google Sheets incomplète. Réessayez.');
 }
 if(status===429)throw new Error('Quota Google Sheets momentanément atteint. Les réponses seront réessayées.');
 if(status<200||status>=300)throw new Error('Google Sheets a répondu HTTP '+status);
 if(data===undefined||data===null)throw new Error('Google Sheets a répondu sans données.');
 return data as T;
}
export async function createComposioSpreadsheet(neonId:string,accountId:string,title:string):Promise<string>{
 const result=await sheetsJSON<{spreadsheetId:string}>(neonId,accountId,SHEETS,'POST',{
  properties:{title:'Monk Form · '+title.slice(0,150)},
  sheets:[{properties:{title:'Réponses'}}],
 });
 if(!result?.spreadsheetId)throw new Error('Google n’a pas créé le tableur.');
 await sheetsJSON(neonId,accountId,SHEETS+'/'+encodeURIComponent(result.spreadsheetId)+'/values/'+encodeURIComponent("'Réponses'!A1:B1")+'?valueInputOption=RAW','PUT',{
  values:[['ID soumission','Date UTC']],
 });
 return result.spreadsheetId;
}
/**
 * Attach an existing Google spreadsheet without touching its other tabs.
 * A dedicated Réponses tab is created only when absent. Existing content
 * is preserved; a conflicting Réponses tab is never overwritten.
 */
export async function prepareExistingComposioSpreadsheet(neonId:string,accountId:string,spreadsheetId:string):Promise<void>{
 if(!/^[A-Za-z0-9_-]{20,150}$/.test(spreadsheetId))throw new Error('Identifiant de tableur Google Sheets invalide.');
 const url=SHEETS+'/'+encodeURIComponent(spreadsheetId);
 const metadata=await sheetsJSON<{spreadsheetId?:string;sheets?:{properties?:{title?:string}}[]}>(neonId,accountId,url+'?fields=spreadsheetId,sheets(properties(title))');
 if(metadata.spreadsheetId!==spreadsheetId)throw new Error('Le tableur Google Sheets est inaccessible.');
 const exists=Boolean(metadata.sheets?.some(sheet=>sheet.properties?.title==='Réponses'));
 if(exists){
  const current=await sheetsJSON<{values?:string[][]}>(neonId,accountId,url+'/values/'+encodeURIComponent("'Réponses'!A1:B1"));
  const first=current.values?.[0]??[];
  if(first.length>0){
   if(first[0]!=='ID soumission'||first[1]!=='Date UTC')
    throw new Error('L’onglet Réponses contient déjà des données incompatibles. Choisissez un autre tableur.');
   return;
  }
 }else{
  await sheetsJSON(neonId,accountId,url+':batchUpdate','POST',{
   requests:[{addSheet:{properties:{title:'Réponses'}}}],
  });
 }
 await sheetsJSON(neonId,accountId,url+'/values/'+encodeURIComponent("'Réponses'!A1:B1")+'?valueInputOption=RAW','PUT',{
  values:[['ID soumission','Date UTC']],
 });
}
export async function googleSheetsComposioJSON<T>(neonId:string,accountId:string,url:string,init?:RequestInit):Promise<T>{
 let body:unknown;
 if(init?.body!==undefined&&init?.body!==null){
  if(typeof init.body!=='string')throw new Error('Corps de requête Google invalide.');
  body=JSON.parse(init.body);
 }
 return sheetsJSON(neonId,accountId,url,init?.method??'GET',body);
}
