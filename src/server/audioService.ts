import { createHash,randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { AUDIO_PART_BYTES, audioPrepareSchema, audioCompleteSchema, audioLimits, audioMode, audioSignature } from '../shared/audio';

export class AudioFault extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const store=()=>getStore('formulaire-singe-audio',{region:'eu-central-1'});
const parts=(key:string,index:number)=>`${key}/part/${index}`;
type Ticket={id:string;storage_key:string;content_type:string;declared_bytes:string|number;status:string;expires_at:string;claim_hash:string;client_nonce:string};
function assertTicket(row:Ticket|undefined,claim:string,nonce:string,allowVerified=false){
 if(!row||row.client_nonce!==nonce||!/^([a-f0-9]{64})$/.test(claim))throw new AudioFault(404,'NOT_FOUND','Transfert audio introuvable.');
 if(!timingSafeEqual(Buffer.from(row.claim_hash,'hex'),Buffer.from(hash(claim),'hex')))throw new AudioFault(404,'NOT_FOUND','Transfert audio introuvable.');
 if(new Date(row.expires_at).getTime()<Date.now())throw new AudioFault(410,'EXPIRED','Le transfert a expiré.');
 if(row.status!=='issued'&&!(allowVerified&&row.status==='verified'))throw new AudioFault(409,'CONFLICT','Transfert audio déjà utilisé.');
}
async function getTicket(slug:string,id:string):Promise<Ticket|undefined>{
 const res=await getDb().execute(sql`SELECT u.id,u.storage_key,u.content_type,u.declared_bytes,u.status,u.expires_at,u.claim_hash,u.client_nonce
 FROM fs_audio_uploads u JOIN fs_forms f ON f.id=u.form_id
 WHERE u.id=${id}::uuid AND f.slug=${slug} AND f.deleted_at IS NULL AND f.archived_at IS NULL LIMIT 1`);
 return res.rows[0] as Ticket|undefined;
}
export async function prepareAudio(slug:string,raw:unknown){
 const input=audioPrepareSchema.parse(raw);
 const db=getDb();
 const res=await db.execute(sql`SELECT f.id AS form_id,q.type,q.settings FROM fs_forms f
 JOIN fs_versions v ON v.form_id=f.id JOIN fs_pages p ON p.version_id=v.id
 JOIN fs_questions q ON q.page_id=p.id
 WHERE f.slug=${slug} AND f.deleted_at IS NULL AND f.archived_at IS NULL
 AND v.id=${input.versionId}::uuid AND v.status='published' AND q.id=${input.questionId}::uuid LIMIT 1`);
 const row=res.rows[0] as {form_id?:string;type?:string;settings?:Record<string,unknown>}|undefined;
 if(!row?.form_id||audioMode(row.type??'',row.settings)==='text')
   throw new AudioFault(404,'NOT_FOUND','Question vocale indisponible.');
 const limit=audioLimits(row.settings);
 if(input.byteSize>limit.maxBytes||input.durationMs>limit.maxSeconds*1000)
   throw new AudioFault(413,'TOO_LARGE','Enregistrement trop long ou volumineux.');
 const count=await db.execute(sql`SELECT count(*)::int AS n FROM fs_audio_uploads WHERE client_nonce=${input.clientNonce}::uuid AND created_at>now()-interval '1 day'`);
 if(Number(count.rows[0]?.n??0)>=20)throw new AudioFault(429,'RATE_LIMIT','Nombre maximal de tentatives atteint.');
 const uploadId=randomUUID(),claimToken=randomBytes(32).toString('hex');
 const key=`audio/${row.form_id}/${input.versionId}/${uploadId}`;
 await db.execute(sql`INSERT INTO fs_audio_uploads
 (id,form_id,version_id,question_id,client_nonce,claim_hash,storage_key,content_type,declared_bytes,duration_ms,expires_at)
 VALUES(${uploadId}::uuid,${row.form_id}::uuid,${input.versionId}::uuid,${input.questionId}::uuid,
 ${input.clientNonce}::uuid,${hash(claimToken)},${key},${input.mimeType},${input.byteSize},${input.durationMs},now()+interval '24 hours')`);
 return {uploadId,claimToken,partBytes:AUDIO_PART_BYTES,partCount:Math.ceil(input.byteSize/AUDIO_PART_BYTES)};
}
export async function uploadAudioPart(slug:string,id:string,index:number,nonce:string,claim:string,request:Request){
 const ticket=await getTicket(slug,id);assertTicket(ticket,claim,nonce);
 const row=ticket!;
 const total=Number(row.declared_bytes),count=Math.ceil(total/AUDIO_PART_BYTES);
 if(!Number.isInteger(index)||index<0||index>=count)
  throw new AudioFault(400,'INVALID_PART','Portion audio invalide.');
 const expected=Math.min(AUDIO_PART_BYTES,total-index*AUDIO_PART_BYTES);
 if(Number(request.headers.get('content-length')??expected)>expected)
  throw new AudioFault(413,'TOO_LARGE','Portion trop volumineuse.');
 const bytes=await request.arrayBuffer();
 if(bytes.byteLength!==expected)throw new AudioFault(422,'INVALID_PART','Taille de la portion incorrecte.');
 const stored=await store().set(parts(row.storage_key,index),new Blob([bytes]),{onlyIfNew:true});
 return {part:index,received:true,alreadyPresent:!stored.modified};
}
export async function completeAudio(slug:string,raw:unknown){
 const input=audioCompleteSchema.parse(raw);
 const ticket=await getTicket(slug,input.uploadId);assertTicket(ticket,input.claimToken,input.clientNonce,true);
 const row=ticket!;
 if(row.status==='verified')return {uploadId:input.uploadId,verified:true};
 const total=Number(row.declared_bytes),count=Math.ceil(total/AUDIO_PART_BYTES);
 const output=new Uint8Array(total);
 const blobs=store();let offset=0;
 for(let i=0;i<count;i++){
  const p=await blobs.get(parts(row.storage_key,i),{type:'arrayBuffer',consistency:'strong'});
  if(!p)throw new AudioFault(409,'UPLOAD_INCOMPLETE',`Portion ${i+1}/${count} manquante.`);
  const data=new Uint8Array(p),expected=Math.min(AUDIO_PART_BYTES,total-i*AUDIO_PART_BYTES);
  if(data.byteLength!==expected)throw new AudioFault(422,'INVALID_PART','Portion de taille incorrecte.');
  output.set(data,offset);offset+=data.length;
 }
 if(offset!==total||!audioSignature(output.subarray(0,64),row.content_type))
  throw new AudioFault(422,'INVALID_AUDIO','Le fichier audio ne correspond pas au format annoncé.');
 await blobs.set(row.storage_key,new Blob([output]),{metadata:{contentType:row.content_type,bytes:total}});
 const db=getDb();
 const updated=await db.execute(sql`UPDATE fs_audio_uploads
 SET status='verified',actual_bytes=${total},verified_at=now()
 WHERE id=${row.id}::uuid AND status='issued' RETURNING id`);
 if(!updated.rows.length)throw new AudioFault(409,'CONFLICT','Enregistrement déjà traité.');
 await Promise.allSettled(Array.from({length:count},(_,i)=>blobs.delete(parts(row.storage_key,i))));
 return {uploadId:input.uploadId,verified:true};
}
export async function getAudioForUser(userId:string,id:string){
 const result=await getDb().execute(sql`SELECT af.storage_key,af.content_type FROM fs_audio_files af
 JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
 JOIN fs_versions v ON v.id=s.version_id JOIN fs_forms f ON f.id=v.form_id
 WHERE af.id=${id}::uuid AND af.status='uploaded' AND af.deleted_at IS NULL
 AND s.deleted_at IS NULL AND f.deleted_at IS NULL
 AND (f.owner_id=${userId} OR EXISTS(SELECT 1 FROM fs_form_members m
 WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role IN ('viewer','editor'))) LIMIT 1`);
 const row=result.rows[0] as {storage_key?:string;content_type?:string}|undefined;
 if(!row?.storage_key)throw new AudioFault(404,'NOT_FOUND','Audio introuvable.');
 const audio=await store().get(row.storage_key,{type:'blob',consistency:'strong'});
 if(!audio)throw new AudioFault(404,'NOT_FOUND','Fichier audio absent.');
 return {blob:audio,type:row.content_type||'application/octet-stream'};
}
export async function listAudioForUser(userId:string){
 const res=await getDb().execute(sql`SELECT af.id,af.content_type,af.byte_size,af.duration_ms,
 f.title AS form_title,q.label AS question,s.submitted_at
 FROM fs_audio_files af JOIN fs_answers a ON a.id=af.answer_id
 JOIN fs_questions q ON q.id=a.question_id
 JOIN fs_submissions s ON s.id=a.submission_id JOIN fs_versions v ON v.id=s.version_id
 JOIN fs_forms f ON f.id=v.form_id
 WHERE af.status='uploaded' AND af.deleted_at IS NULL AND s.deleted_at IS NULL AND f.deleted_at IS NULL
 AND (f.owner_id=${userId} OR EXISTS(SELECT 1 FROM fs_form_members m
 WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role IN ('viewer','editor')))
 ORDER BY s.submitted_at DESC LIMIT 100`);
 return res.rows;
}
export async function cleanupAbandonedAudio(){
 const db=getDb();
 const r=await db.execute(sql`SELECT id,storage_key,declared_bytes FROM fs_audio_uploads
 WHERE expires_at<now() AND status IN ('issued','verified') ORDER BY expires_at LIMIT 30`);
 let removed=0;const blobs=store();
 for(const rec of r.rows){
  const id=String(rec.id),key=String(rec.storage_key);
  try{
   await blobs.delete(key);
   const count=Math.ceil(Number(rec.declared_bytes)/AUDIO_PART_BYTES);
   await Promise.allSettled(Array.from({length:count},(_,i)=>blobs.delete(parts(key,i))));
   await db.execute(sql`UPDATE fs_audio_uploads SET status='expired' WHERE id=${id}::uuid AND status IN ('issued','verified')`);
   removed++;
  }catch(e){console.error('Abandoned audio cleanup',id,e instanceof Error?e.name:'unknown');}
 }
 const deleted=await db.execute(sql`SELECT af.id,af.storage_key FROM fs_audio_files af
 JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
 WHERE s.deleted_at IS NOT NULL AND af.status<>'removed' LIMIT 30`);
 for(const r of deleted.rows){
  try{await blobs.delete(String(r.storage_key));
    await db.execute(sql`UPDATE fs_audio_files SET status='removed',deleted_at=COALESCE(deleted_at,now()),transcript=NULL WHERE id=${String(r.id)}::uuid`);
  }catch(e){console.error('Deleted audio cleanup',e instanceof Error?e.name:'unknown');}
 }
 return {removedAbandoned:removed,removedDeleted:deleted.rows.length};
}
