import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { composioConfigured,googleSheetsComposioJSON } from './composioService';

const SHEET_NAME='Réponses';
const ROOT='https://sheets.googleapis.com/v4/spreadsheets';
function credentials(){
 const id=process.env.GOOGLE_SHEETS_CLIENT_ID, secret=process.env.GOOGLE_SHEETS_CLIENT_SECRET;
 const key=process.env.GOOGLE_SHEETS_TOKEN_KEY;
 if(!id||!secret||!key)throw new Error('Configuration Google Sheets incomplète.');
 const bytes=Buffer.from(key,'base64');
 if(bytes.length!==32)throw new Error('La clé de chiffrement Google Sheets doit contenir 32 octets.');
 return {id,secret,key:bytes};
}
export function legacySheetsConfigured(){
 try{credentials();return Boolean(process.env.GOOGLE_SHEETS_REDIRECT_URI&&process.env.GOOGLE_SHEETS_STATE_SECRET&&process.env.GOOGLE_SHEETS_STATE_SECRET.length>=32);}
 catch{return false;}
}
export function sheetsConfigured(){return composioConfigured()||legacySheetsConfigured();}
export function encryptRefreshToken(plain:string){
 const {key}=credentials();
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const content=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),content.toString('base64url')].join('.');
}
function decryptRefreshToken(encrypted:string){
 const {key}=credentials();
 const [a,b,c]=encrypted.split('.');
 if(!a||!b||!c)throw new Error('Jeton Google corrompu');
 const decoder=createDecipheriv('aes-256-gcm',key,Buffer.from(a,'base64url'));
 decoder.setAuthTag(Buffer.from(b,'base64url'));
 return Buffer.concat([decoder.update(Buffer.from(c,'base64url')),decoder.final()]).toString('utf8');
}
async function googleJSON<T>(url:string,token:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{...init,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...(init?.headers??{})}});
 if(!response.ok)throw new Error('Google Sheets a répondu HTTP '+response.status);
 return await response.json() as T;
}
export async function exchangeGoogleCode(code:string){
 const {id,secret}=credentials();
 const redirect=process.env.GOOGLE_SHEETS_REDIRECT_URI;
 if(!redirect)throw new Error('Redirection OAuth non configurée');
 const body=new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirect,grant_type:'authorization_code'});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded'}});
 if(!response.ok)throw new Error('Google a refusé la connexion : HTTP '+response.status);
 const data=await response.json() as {access_token?:string;refresh_token?:string};
 if(!data.access_token||!data.refresh_token)throw new Error('Aucun accès permanent Google accordé. Réessayez la connexion.');
 return {access:data.access_token,refresh:data.refresh_token};
}
async function refreshAccess(refresh:string){
 const {id,secret}=credentials();
 const body=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded'}});
 if(!response.ok)throw new Error('Autorisation Google expirée ou révoquée : HTTP '+response.status);
 const data=await response.json() as {access_token?:string};
 if(!data.access_token)throw new Error('Google n’a pas renvoyé de jeton.');
 return data.access_token;
}
export async function createGoogleSpreadsheet(access:string,title:string){
 const created=await googleJSON<{spreadsheetId:string}>(ROOT,access,{
  method:'POST',body:JSON.stringify({properties:{title:'Monk Form · '+title.slice(0,150)},sheets:[{properties:{title:SHEET_NAME}}]})
 });
 if(!created.spreadsheetId)throw new Error('Google n’a pas créé la feuille.');
 await googleJSON(ROOT+'/'+encodeURIComponent(created.spreadsheetId)+'/values/'+encodeURIComponent("'"+SHEET_NAME+"'!A1:B1")+'?valueInputOption=RAW',access,{
  method:'PUT',body:JSON.stringify({values:[['ID soumission','Date UTC']]})
 });
 return created.spreadsheetId;
}
export async function saveGoogleConnection(formId:string,ownerId:string,sheetId:string,refresh:string){
 const db=getDb(),encrypted=encryptRefreshToken(refresh);
 await db.execute(sql`INSERT INTO fs_google_sheets(form_id,owner_id,spreadsheet_id,encrypted_refresh_token,provider,composio_account_id)
  VALUES (${formId}::uuid,${ownerId},${sheetId},${encrypted},'legacy',NULL)
  ON CONFLICT(form_id) DO UPDATE SET owner_id=excluded.owner_id,spreadsheet_id=excluded.spreadsheet_id,
   encrypted_refresh_token=excluded.encrypted_refresh_token,provider='legacy',composio_account_id=NULL,created_at=now(),last_synced_at=NULL,last_error=NULL`);
 // A new spreadsheet must receive even previously delivered rows.
 await db.execute(sql`DELETE FROM fs_sheet_deliveries WHERE form_id=${formId}::uuid`);
}
export async function saveComposioConnection(formId:string,ownerId:string,sheetId:string,accountId:string){
 const db=getDb();
 await db.execute(sql`INSERT INTO fs_google_sheets(form_id,owner_id,spreadsheet_id,encrypted_refresh_token,provider,composio_account_id)
  VALUES (${formId}::uuid,${ownerId},${sheetId},NULL,'composio',${accountId})
  ON CONFLICT(form_id) DO UPDATE SET owner_id=excluded.owner_id,spreadsheet_id=excluded.spreadsheet_id,
   encrypted_refresh_token=NULL,provider='composio',composio_account_id=excluded.composio_account_id,
   created_at=now(),last_synced_at=NULL,last_error=NULL`);
 // Never reuse prior delivery markers with a freshly created spreadsheet.
 await db.execute(sql`DELETE FROM fs_sheet_deliveries WHERE form_id=${formId}::uuid`);
}
export async function getSheetsStatus(userId:string,formId:string){
 const db=getDb();
 const access=await db.execute(sql`SELECT id FROM fs_forms WHERE id=${formId}::uuid AND owner_id=${userId}
  AND deleted_at IS NULL LIMIT 1`);
 if(!access.rows.length)throw new Error('Formulaire introuvable ou accès insuffisant.');
 const r=await db.execute(sql`SELECT spreadsheet_id,last_synced_at,last_error FROM fs_google_sheets WHERE form_id=${formId}::uuid`);
 const info=r.rows[0] as {spreadsheet_id:string;last_synced_at:string|null;last_error:string|null}|undefined;
 const count=await db.execute(sql`SELECT count(*)::int AS pending FROM fs_sheet_deliveries
  WHERE form_id=${formId}::uuid AND state<>'done'`);
 return {configured:sheetsConfigured(),connected:Boolean(info),spreadsheetUrl:info?'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(info.spreadsheet_id)+'/edit':null,
  lastSyncedAt:info?.last_synced_at??null,lastError:info?.last_error??null,pending:Number(count.rows[0]?.pending??0)};
}
export async function assertSheetOwner(userId:string,formId:string){
 if(!/^[0-9a-f-]{36}$/i.test(formId))throw new Error('Identifiant invalide.');
 const db=getDb();
 const r=await db.execute(sql`SELECT id,title FROM fs_forms WHERE id=${formId}::uuid AND owner_id=${userId}
 AND deleted_at IS NULL LIMIT 1`);
 const row=r.rows[0] as {id:string;title:string}|undefined;
 if(!row)throw new Error('Ce formulaire ne vous appartient pas.');
 return row;
}
export async function disconnectSheets(userId:string,formId:string){
 await assertSheetOwner(userId,formId);
 const db=getDb();
 await db.execute(sql`DELETE FROM fs_google_sheets WHERE form_id=${formId}::uuid`);
 await db.execute(sql`DELETE FROM fs_sheet_deliveries WHERE form_id=${formId}::uuid`);
}
export async function resetFailedSheets(userId:string,formId:string){
 await assertSheetOwner(userId,formId);
 await getDb().execute(sql`UPDATE fs_sheet_deliveries SET state='pending',attempts=0,claimed_at=NULL,last_error=NULL
 WHERE form_id=${formId}::uuid AND state<>'done'`);
}
function valueToText(value:unknown,hasAudio:boolean){
 if(hasAudio){
  const text=value&&typeof value==='object'&&!Array.isArray(value)&&'text' in value&&typeof value.text==='string'?value.text.trim():'';
  return 'Enregistrement audio privé'+(text?' ; Texte : '+text:'');
 }
 if(value===null||value===undefined)return '';
 if(Array.isArray(value))return value.map(v=>String(v)).join(' ; ');
 if(typeof value==='object')return 'Réponse structurée';
 return String(value);
}
type Delivery={submission_id:string;form_id:string};
type SheetConnection={spreadsheet_id:string;owner_id:string;provider:string;composio_account_id:string|null;encrypted_refresh_token:string|null};
export async function syncGoogleSheets(maxItems=10,onlyFormId?:string){
 const db=getDb();
 // Reconcile independently from HTTP submission success, including older responses.
 await db.execute(sql`INSERT INTO fs_sheet_deliveries(submission_id,form_id)
  SELECT s.id,g.form_id FROM fs_google_sheets g
  JOIN fs_versions v ON v.form_id=g.form_id
  JOIN fs_submissions s ON s.version_id=v.id
  WHERE s.status='submitted' AND s.deleted_at IS NULL
  AND (${onlyFormId??null}::uuid IS NULL OR g.form_id=${onlyFormId??null}::uuid)
  AND NOT EXISTS(SELECT 1 FROM fs_sheet_deliveries d WHERE d.submission_id=s.id)
  ORDER BY s.submitted_at LIMIT 500 ON CONFLICT DO NOTHING`);
 const claimed=await db.execute(sql`UPDATE fs_sheet_deliveries d SET state='processing',attempts=d.attempts+1,claimed_at=now()
 WHERE d.submission_id IN (SELECT x.submission_id FROM fs_sheet_deliveries x
  JOIN fs_google_sheets g ON g.form_id=x.form_id
  WHERE (x.state='pending' OR (x.state='processing' AND x.claimed_at<now()-interval '15 minutes'))
   AND x.attempts<10 AND (${onlyFormId??null}::uuid IS NULL OR x.form_id=${onlyFormId??null}::uuid)
   ORDER BY x.claimed_at NULLS FIRST LIMIT ${Math.min(20,Math.max(1,maxItems))}
  FOR UPDATE OF x SKIP LOCKED)
 RETURNING d.submission_id,d.form_id`);
 let done=0,failed=0;
 for(const item of claimed.rows as unknown as Delivery[]){
  try{
   await syncOne(item);
   await db.execute(sql`UPDATE fs_sheet_deliveries SET state='done',synced_at=now(),last_error=NULL WHERE submission_id=${item.submission_id}::uuid`);
   await db.execute(sql`UPDATE fs_google_sheets SET last_synced_at=now(),last_error=NULL WHERE form_id=${item.form_id}::uuid`);
   done++;
  }catch(error){
   failed++;
   const reason=(error instanceof Error?error.message:'Erreur inconnue').slice(0,220);
   await db.execute(sql`UPDATE fs_sheet_deliveries SET state='pending',last_error=${reason} WHERE submission_id=${item.submission_id}::uuid`);
   await db.execute(sql`UPDATE fs_google_sheets SET last_error=${reason} WHERE form_id=${item.form_id}::uuid`);
  }
 }
 return {claimed:claimed.rows.length,done,failed};
}
async function syncOne(item:Delivery){
 const db=getDb();
 const r=await db.execute(sql`SELECT spreadsheet_id,owner_id,provider,composio_account_id,encrypted_refresh_token FROM fs_google_sheets WHERE form_id=${item.form_id}::uuid`);
 const conn=r.rows[0] as SheetConnection|undefined;
 if(!conn)throw new Error('Connexion supprimée');
 let access:string|null=null;
 if(conn.provider==='legacy'){
  if(!conn.encrypted_refresh_token)throw new Error('Jeton Google manquant.');
  access=await refreshAccess(decryptRefreshToken(conn.encrypted_refresh_token));
 }else if(conn.provider==='composio'){
  if(!composioConfigured()||!conn.composio_account_id)throw new Error('Connexion Google Sheets indisponible.');
 }else throw new Error('Fournisseur Google Sheets inconnu.');
 const query=<T>(url:string,init?:RequestInit):Promise<T>=>conn.provider==='composio'
  ?googleSheetsComposioJSON<T>(conn.owner_id,conn.composio_account_id!,url,init)
  :googleJSON<T>(url,access!,init);
 const root=ROOT+'/'+encodeURIComponent(conn.spreadsheet_id)+'/values/';
 const range=(r:string)=>root+encodeURIComponent("'"+SHEET_NAME+"'!"+r);
 const headersResult=await query<{values?:string[][]}>(range('1:1'));
 const headers=headersResult.values?.[0]?.length?headersResult.values[0]:['ID soumission','Date UTC'];
 const seen=await query<{values?:string[][]}>(range('A2:A'));
 if((seen.values??[]).some(row=>row[0]===item.submission_id))return;
 const meta=await db.execute(sql`SELECT submitted_at FROM fs_submissions WHERE id=${item.submission_id}::uuid
 AND status='submitted' AND deleted_at IS NULL LIMIT 1`);
 const submittedAt=meta.rows[0]?.submitted_at;
 if(!submittedAt)throw new Error('Participation indisponible');
 const answers=await db.execute(sql`SELECT q.id,q.label,a.value,(af.id IS NOT NULL) AS has_audio
 FROM fs_answers a JOIN fs_questions q ON q.id=a.question_id
 LEFT JOIN fs_audio_files af ON af.answer_id=a.id AND af.status='uploaded' AND af.deleted_at IS NULL
 WHERE a.submission_id=${item.submission_id}::uuid ORDER BY q.position`);
 const cells=new Map<string,string>();
 for(const answer of answers.rows){
  const identity='['+String(answer.id)+']';
  // Keep the same column when a published question is renamed later.
  const key=headers.find(h=>h.endsWith(identity))??String(answer.label)+' '+identity;
  cells.set(key,valueToText(answer.value,Boolean(answer.has_audio)));
  if(!headers.includes(key))headers.push(key);
 }
 if(headers.length>(headersResult.values?.[0]?.length??0))await query(range('1:1')+'?valueInputOption=RAW',{
  method:'PUT',body:JSON.stringify({values:[headers]})
 });
 const row=headers.map((h,i)=>i===0?item.submission_id:i===1?new Date(String(submittedAt)).toISOString():(cells.get(h)??''));
 await query(range('A1')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
  method:'POST',body:JSON.stringify({values:[row]})
 });
}
