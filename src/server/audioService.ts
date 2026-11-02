import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from './db/client';
import { audioUploads } from './db/schema';
import { R2AudioStorage, type AudioStorage } from './audioStorage';
import { audioCompleteSchema,audioLimits,audioMode,audioPrepareSchema, normalizedMime } from '../shared/audio';

export class AudioFault extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export interface AudioService {
 prepare(slug:string,input:unknown):Promise<{uploadId:string;claimToken:string;uploadUrl:string;contentType:string;expiresIn:number}>;
 complete(slug:string,input:unknown):Promise<{uploadId:string;verified:boolean}>;
 access(userId:string,audioId:string):Promise<{url:string;expiresIn:number}>;
}
export class NeonAudioService implements AudioService {
 constructor(private storage:AudioStorage=new R2AudioStorage()){}
 async prepare(slug:string,input:unknown){
  const data=audioPrepareSchema.parse(input);const db=getDb();
  // A client is allowed to issue a ticket only for a public, published question.
  const rows=await db.execute(sql`SELECT f.id AS form_id,q.type,q.settings
  FROM fs_forms f JOIN fs_versions v ON v.form_id=f.id
  JOIN fs_pages p ON p.version_id=v.id JOIN fs_questions q ON q.page_id=p.id
  WHERE f.slug=${slug} AND f.deleted_at IS NULL AND f.archived_at IS NULL
  AND v.id=${data.versionId}::uuid AND v.status='published' AND q.id=${data.questionId}::uuid LIMIT 1`);
  const row=rows.rows[0] as {form_id?:string;type?:string;settings?:Record<string,unknown>}|undefined;
  if(!row?.form_id||audioMode(row.type??'',row.settings)==='text')throw new AudioFault(404,'NOT_FOUND','Question vocale indisponible.');
  const limits=audioLimits(row.settings);
  if(data.byteSize>limits.maxBytes||data.durationMs>limits.maxSeconds*1000)throw new AudioFault(413,'LIMIT_EXCEEDED','Enregistrement trop long ou trop volumineux.');
  const existing=await db.select({id:audioUploads.id}).from(audioUploads).where(and(eq(audioUploads.clientNonce,data.clientNonce),eq(audioUploads.versionId,data.versionId))).limit(20);
  if(existing.length>=20)throw new AudioFault(429,'LIMIT_EXCEEDED','Trop de tentatives audio pour cette participation.');
  const uploadId=randomUUID(),claimToken=randomBytes(32).toString('hex');
  const key=`audio/${row.form_id}/${data.versionId}/${uploadId}`;
  await db.insert(audioUploads).values({id:uploadId,formId:row.form_id,versionId:data.versionId,questionId:data.questionId,
   clientNonce:data.clientNonce,claimHash:hash(claimToken),storageKey:key,contentType:data.mimeType,
   declaredBytes:data.byteSize,durationMs:data.durationMs,expiresAt:new Date(Date.now()+24*3600_000)});
  return {uploadId,claimToken,uploadUrl:await this.storage.presignPut(key,data.mimeType),contentType:data.mimeType,expiresIn:120};
 }
 async complete(slug:string,input:unknown){
  const data=audioCompleteSchema.parse(input),db=getDb();
  const rows=await db.execute(sql`SELECT u.id,u.storage_key,u.content_type,u.declared_bytes,u.status,u.expires_at
  FROM fs_audio_uploads u JOIN fs_forms f ON f.id=u.form_id
  WHERE f.slug=${slug} AND f.archived_at IS NULL AND f.deleted_at IS NULL
  AND u.id=${data.uploadId}::uuid AND u.client_nonce=${data.clientNonce}::uuid
  AND u.claim_hash=${hash(data.claimToken)} LIMIT 1`);
  const row=rows.rows[0] as {id:string;storage_key:string;content_type:string;declared_bytes:string|number;status:string;expires_at:string}|undefined;
  if(!row||new Date(row.expires_at).getTime()<Date.now())throw new AudioFault(410,'EXPIRED','Téléversement expiré. Réessayez.');
  if(row.status==='verified')return {uploadId:data.uploadId,verified:true};
  if(row.status!=='issued')throw new AudioFault(409,'CONFLICT','Ce fichier n’est plus disponible.');
  const file=await this.storage.inspect(row.storage_key);
  if(!file)throw new AudioFault(409,'UPLOAD_MISSING','Fichier non reçu. Vérifiez votre connexion.');
  if(!file.signatureValid||file.byteSize!==Number(row.declared_bytes)||normalizedMime(file.mimeType)!==normalizedMime(row.content_type)){
    // Remove a suspicious or malformed object. Ticket is not claimable.
    await this.storage.remove(row.storage_key);
    throw new AudioFault(422,'INVALID_AUDIO','Le fichier reçu ne correspond pas à un audio valide.');
  }
  const updated=await db.update(audioUploads).set({status:'verified',actualBytes:file.byteSize,verifiedAt:new Date()})
    .where(and(eq(audioUploads.id,data.uploadId),eq(audioUploads.status,'issued'))).returning({id:audioUploads.id});
  if(!updated.length)throw new AudioFault(409,'CONFLICT','Fichier déjà traité.');
  return {uploadId:data.uploadId,verified:true};
 }
 async access(userId:string,audioId:string){
  const db=getDb();const result=await db.execute(sql`SELECT a.storage_key FROM fs_audio_files a
   JOIN fs_answers an ON an.id=a.answer_id JOIN fs_submissions s ON s.id=an.submission_id
   JOIN fs_versions v ON v.id=s.version_id JOIN fs_forms f ON f.id=v.form_id
   WHERE a.id=${audioId}::uuid AND a.status='uploaded' AND a.deleted_at IS NULL
   AND s.deleted_at IS NULL AND f.deleted_at IS NULL AND
   (f.owner_id=${userId} OR EXISTS (SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role IN ('viewer','editor'))) LIMIT 1`);
  const key=result.rows[0]?.storage_key;
  if(typeof key!=='string')throw new AudioFault(404,'NOT_FOUND','Enregistrement introuvable.');
  return {url:await this.storage.presignGet(key),expiresIn:60};
 }
}
