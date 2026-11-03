import {getStore} from '@netlify/blobs';
import {sql} from 'drizzle-orm';
import {getDb} from './db/client';

const MODEL='@cf/openai/whisper-large-v3-turbo';
const MAX_BYTES=18*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const audioStore=()=>getStore({name:'formulaire-singe-audio',region:'eu-central-1'});

export class TranscriptionFault extends Error{
 constructor(public status:number,message:string){super(message);}
}
export function transcriptionConfigured(){
 return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_WORKERS_AI_TOKEN);
}
export async function getAutoTranscription(userId:string,formId:string){
 if(!UUID.test(formId))throw new TranscriptionFault(400,'Identifiant de formulaire invalide.');
 const r=await getDb().execute(sql`SELECT f.settings,f.owner_id,f.id FROM fs_forms f WHERE f.id=${formId}::uuid
  AND f.deleted_at IS NULL AND (f.owner_id=${userId} OR EXISTS(
   SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role IN ('viewer','editor')
  )) LIMIT 1`);
 const row=r.rows[0] as {settings:Record<string,unknown>;owner_id:string}|undefined;
 if(!row)throw new TranscriptionFault(404,'Formulaire introuvable.');
 const edit=await getDb().execute(sql`SELECT 1 FROM fs_forms f WHERE f.id=${formId}::uuid
  AND (f.owner_id=${userId} OR EXISTS (SELECT 1 FROM fs_form_members m
  WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role='editor')) LIMIT 1`);
 return {automatic:row.settings?.autoTranscribeAudio===true,available:transcriptionConfigured(),canManage:edit.rows.length>0};
}
export async function setAutoTranscription(userId:string,formId:string,automatic:boolean){
 if(!UUID.test(formId))throw new TranscriptionFault(400,'Identifiant de formulaire invalide.');
 if(automatic&&!transcriptionConfigured())throw new TranscriptionFault(503,'Le moteur de transcription n’est pas configuré.');
 const r=await getDb().execute(sql`UPDATE fs_forms f SET
 settings=jsonb_set(f.settings,'{autoTranscribeAudio}',to_jsonb(${automatic}::boolean),true),
 updated_at=now() WHERE f.id=${formId}::uuid AND f.deleted_at IS NULL
 AND (f.owner_id=${userId} OR EXISTS (SELECT 1 FROM fs_form_members m
 WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role='editor'))
 RETURNING f.id`);
 if(!r.rows.length)throw new TranscriptionFault(403,'Modification non autorisée.');
 return {automatic};
}
export async function requestAudioTranscription(userId:string,audioId:string){
 if(!UUID.test(audioId))throw new TranscriptionFault(400,'Identifiant audio invalide.');
 if(!transcriptionConfigured())throw new TranscriptionFault(503,'Le moteur de transcription n’est pas disponible.');
 const db=getDb();
 const access=await db.execute(sql`SELECT af.id,af.transcript,af.transcript_source,af.byte_size
 FROM fs_audio_files af JOIN fs_answers a ON a.id=af.answer_id
 JOIN fs_submissions s ON s.id=a.submission_id JOIN fs_versions v ON v.id=s.version_id
 JOIN fs_forms f ON f.id=v.form_id
 WHERE af.id=${audioId}::uuid AND af.status='uploaded' AND af.deleted_at IS NULL
 AND s.deleted_at IS NULL AND f.deleted_at IS NULL
 AND (f.owner_id=${userId} OR EXISTS(SELECT 1 FROM fs_form_members m
 WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role='editor')) LIMIT 1`);
 const row=access.rows[0] as {id:string;transcript:string|null;transcript_source:string|null;byte_size:number|string}|undefined;
 if(!row)throw new TranscriptionFault(404,'Enregistrement introuvable ou accès insuffisant.');
 if(row.transcript?.trim())return {status:'done',text:row.transcript};
 if(Number(row.byte_size)>MAX_BYTES)throw new TranscriptionFault(413,'Enregistrement trop volumineux pour la transcription gratuite (18 Mio maximum).');
 await db.execute(sql`INSERT INTO fs_audio_transcription_jobs(audio_id,status,requested_by)
 VALUES(${audioId}::uuid,'pending',${userId})
 ON CONFLICT(audio_id) DO UPDATE SET status=CASE WHEN fs_audio_transcription_jobs.status IN('failed') THEN 'pending'
 ELSE fs_audio_transcription_jobs.status END,
 attempts=CASE WHEN fs_audio_transcription_jobs.status='failed' THEN 0 ELSE fs_audio_transcription_jobs.attempts END,
 next_attempt_at=CASE WHEN fs_audio_transcription_jobs.status='failed' THEN now()
 ELSE fs_audio_transcription_jobs.next_attempt_at END,
 error=CASE WHEN fs_audio_transcription_jobs.status='failed' THEN NULL ELSE fs_audio_transcription_jobs.error END,
 updated_at=now()`);
 return {status:'pending'};
}
export async function runTranscriptionQueue(){
 if(!transcriptionConfigured())return {configured:false,claimed:0,done:0,failed:0};
 const db=getDb();
 // Only forms explicitly opted into automatic processing are enqueued.
 await db.execute(sql`INSERT INTO fs_audio_transcription_jobs(audio_id,status)
 SELECT af.id,'pending' FROM fs_audio_files af
 JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
 JOIN fs_versions v ON v.id=s.version_id JOIN fs_forms f ON f.id=v.form_id
 WHERE f.settings->>'autoTranscribeAudio'='true' AND f.deleted_at IS NULL
 AND af.status='uploaded' AND af.deleted_at IS NULL AND af.transcript IS NULL
 AND s.status='submitted' AND s.deleted_at IS NULL
 ORDER BY af.created_at LIMIT 30 ON CONFLICT(audio_id) DO NOTHING`);
 const claimed=await db.execute(sql`WITH task AS (
 SELECT audio_id FROM fs_audio_transcription_jobs
 WHERE ((status='pending' AND next_attempt_at<=now())
 OR (status='processing' AND updated_at<now()-interval '20 minutes'))
 AND attempts<4
 ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE fs_audio_transcription_jobs j
 SET status='processing',attempts=j.attempts+1,updated_at=now(),error=NULL
 FROM task WHERE task.audio_id=j.audio_id RETURNING j.audio_id,j.attempts`);
 if(!claimed.rows.length)return {configured:true,claimed:0,done:0,failed:0};
 const audioId=String(claimed.rows[0].audio_id);
 const attempts=Number(claimed.rows[0].attempts);
 try{
  const r=await db.execute(sql`SELECT af.storage_key,af.byte_size,af.transcript,af.status
   FROM fs_audio_files af JOIN fs_answers a ON a.id=af.answer_id
   JOIN fs_submissions s ON s.id=a.submission_id JOIN fs_versions v ON v.id=s.version_id
   JOIN fs_forms f ON f.id=v.form_id WHERE af.id=${audioId}::uuid
   AND af.deleted_at IS NULL AND af.status='uploaded' AND s.deleted_at IS NULL AND f.deleted_at IS NULL
   LIMIT 1`);
  const row=r.rows[0] as {storage_key:string;byte_size:number|string;transcript:string|null;status:string}|undefined;
  if(!row)throw new TranscriptionFault(404,'Fichier audio supprimé.');
  if(row.transcript?.trim()){
   await db.execute(sql`UPDATE fs_audio_transcription_jobs SET status='done',updated_at=now()
    WHERE audio_id=${audioId}::uuid`);
   return {configured:true,claimed:1,done:1,failed:0};
  }
  if(Number(row.byte_size)>MAX_BYTES)throw new TranscriptionFault(413,'Fichier audio trop volumineux (18 Mio maximum).');
  const blob=await audioStore().get(row.storage_key,{type:'arrayBuffer',consistency:'strong'});
  if(!blob)throw new TranscriptionFault(404,'Fichier audio introuvable.');
  const bytes=new Uint8Array(blob);
  if(bytes.length===0||bytes.length>MAX_BYTES)throw new TranscriptionFault(413,'Taille du fichier audio non prise en charge.');
  const url='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/ai/run/'+MODEL;
  const response=await fetch(url,{method:'POST',headers:{
   Authorization:'Bearer '+process.env.CLOUDFLARE_WORKERS_AI_TOKEN,'Content-Type':'application/json'
  },body:JSON.stringify({audio:Buffer.from(bytes).toString('base64'),task:'transcribe',language:'fr',vad_filter:true}),
  signal:AbortSignal.timeout(150000)});
  if(response.status===429)throw new TranscriptionFault(429,'Quota gratuit Cloudflare atteint ; prochain essai demain.');
  if(!response.ok)throw new TranscriptionFault(response.status,'Cloudflare a refusé le traitement audio (HTTP '+response.status+').');
  const result=await response.json() as {success?:boolean;result?:{text?:string};errors?:unknown[]};
  const transcript=result.result?.text?.trim()??'';
  if(result.success===false||!transcript)throw new TranscriptionFault(422,'Aucun texte intelligible détecté.');
  await db.execute(sql`UPDATE fs_audio_files SET transcript=${transcript},
   transcript_source='cloudflare-whisper-large-v3-turbo',transcript_updated_at=now()
   WHERE id=${audioId}::uuid AND transcript IS NULL AND deleted_at IS NULL`);
  await db.execute(sql`UPDATE fs_audio_transcription_jobs SET status='done',error=NULL,updated_at=now()
   WHERE audio_id=${audioId}::uuid`);
  return {configured:true,claimed:1,done:1,failed:0};
 }catch(e){
  const err=e instanceof TranscriptionFault?e:null;
  const message=err?.message??'Transcription temporairement indisponible.';
  const permanent=Boolean(err&&[400,403,404,413,415,422].includes(err.status));
  const failed=permanent||attempts>=4;
  const hours=err?.status===429?25:Math.min(8,2**attempts);
  await db.execute(sql`UPDATE fs_audio_transcription_jobs SET
   status=${failed?'failed':'pending'},error=${message},updated_at=now(),
   next_attempt_at=now()+(${hours}::int * interval '1 hour')
   WHERE audio_id=${audioId}::uuid`);
  return {configured:true,claimed:1,done:0,failed:1};
 }
}
