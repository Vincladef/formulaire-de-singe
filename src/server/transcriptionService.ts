import {getStore} from '@netlify/blobs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {getDb} from './db/client';

const MODEL='@cf/openai/whisper-large-v3-turbo';
const MAX_BYTES=18*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const audioStore=()=>getStore({name:'formulaire-singe-audio',region:'eu-central-1'});

/** Authenticates the Netlify scheduler and manual trigger; never share the Cloudflare key with clients. */
function internalMac(timestamp:string){
 const secret=process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
 if(!secret)throw new Error('Transcription non configurée');
 return createHmac('sha256',secret).update('monk-audio-transcribe:'+timestamp).digest('hex');
}
export function verifyTranscriptionWorkerRequest(request:Request){
 const timestamp=request.headers.get('x-monk-timestamp')??'';
 const provided=request.headers.get('x-monk-signature')??'';
 if(!/^[0-9]{13}$/.test(timestamp)||!/^[a-f0-9]{64}$/.test(provided))return false;
 if(Math.abs(Date.now()-Number(timestamp))>120000)return false;
 const expected=internalMac(timestamp);
 return timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(expected,'hex'));
}
export async function wakeTranscriptionWorker(){
 if(!transcriptionConfigured())return false;
 const timestamp=String(Date.now());
 const host=process.env.URL||'https://monk-form.netlify.app';
 const endpoint=new URL('/.netlify/functions/audio-transcribe-background',host);
 // No user content or IDs are sent; the worker claims its own durable job.
 const response=await fetch(endpoint,{method:'POST',headers:{
  'x-monk-timestamp':timestamp,'x-monk-signature':internalMac(timestamp)
 },signal:AbortSignal.timeout(12000)});
 return response.status===202||response.ok;
}

export class TranscriptionFault extends Error{
 constructor(public status:number,message:string){super(message);}
}
export function transcriptionConfigured(){
 return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_WORKERS_AI_TOKEN);
}
export async function getTranscriptionSummary(userId:string,formId:string){
 if(!UUID.test(formId))throw new TranscriptionFault(400,'Formulaire invalide.');
 const db=getDb();
 const auth=await db.execute(sql`SELECT f.id,f.owner_id,
 (f.owner_id=${userId} OR EXISTS(SELECT 1 FROM fs_form_members m WHERE m.form_id=f.id
 AND m.user_id=${userId} AND m.role='editor')) AS can_manage
 FROM fs_forms f WHERE f.id=${formId}::uuid AND f.deleted_at IS NULL
 AND (f.owner_id=${userId} OR EXISTS(SELECT 1 FROM fs_form_members m
 WHERE m.form_id=f.id AND m.user_id=${userId} AND m.role IN ('editor','viewer'))) LIMIT 1`);
 if(!auth.rows.length)throw new TranscriptionFault(404,'Formulaire introuvable.');
 const result=await db.execute(sql`SELECT
 count(*)::int AS total,
 count(*) FILTER (WHERE af.transcript IS NOT NULL AND length(trim(af.transcript))>0)::int AS done,
 count(*) FILTER (WHERE COALESCE(j.status,'none') IN ('pending','processing'))::int AS queued,
 count(*) FILTER (WHERE af.transcript IS NULL AND j.status='failed')::int AS failed,
 count(*) FILTER (WHERE af.transcript IS NULL AND af.byte_size<=${MAX_BYTES}
  AND COALESCE(j.status,'none') NOT IN ('pending','processing'))::int AS actionable,
 count(*) FILTER (WHERE af.transcript IS NULL AND af.byte_size>${MAX_BYTES})::int AS unsupported,
 count(*) FILTER (WHERE j.status='pending'
  AND j.error LIKE 'Quota gratuit%')::int AS quotaDelayed
 FROM fs_audio_files af
 JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
 JOIN fs_versions v ON v.id=s.version_id
 LEFT JOIN fs_audio_transcription_jobs j ON j.audio_id=af.id
 WHERE v.form_id=${formId}::uuid AND s.status='submitted' AND s.deleted_at IS NULL
 AND af.status='uploaded' AND af.deleted_at IS NULL`);
 const row=result.rows[0]??{};
 return {available:transcriptionConfigured(),canManage:Boolean(auth.rows[0].can_manage),
  total:Number(row.total??0),done:Number(row.done??0),queued:Number(row.queued??0),
  failed:Number(row.failed??0),actionable:Number(row.actionable??0),unsupported:Number(row.unsupported??0),
  quotaDelayed:Number(row.quotaDelayed??0)};
}
export async function requestFormTranscription(userId:string,formId:string){
 if(!transcriptionConfigured())throw new TranscriptionFault(503,'Le moteur de transcription n’est pas disponible.');
 const summary=await getTranscriptionSummary(userId,formId);
 if(!summary.canManage)throw new TranscriptionFault(403,'Modification non autorisée.');
 const result=await getDb().execute(sql`INSERT INTO fs_audio_transcription_jobs(audio_id,status,requested_by,attempts,next_attempt_at,error,force)
 SELECT af.id,'pending',${userId},0,now(),NULL,false FROM fs_audio_files af
 JOIN fs_answers a ON a.id=af.answer_id JOIN fs_submissions s ON s.id=a.submission_id
 JOIN fs_versions v ON v.id=s.version_id WHERE v.form_id=${formId}::uuid
 AND af.deleted_at IS NULL AND af.status='uploaded' AND af.transcript IS NULL
 AND af.byte_size<=${MAX_BYTES} AND s.status='submitted' AND s.deleted_at IS NULL
 ON CONFLICT(audio_id) DO UPDATE SET status='pending',
 attempts=0,next_attempt_at=now(),error=NULL,force=false,updated_at=now()
 WHERE fs_audio_transcription_jobs.status IN ('failed','done')
 RETURNING audio_id`);
 return {...await getTranscriptionSummary(userId,formId),newlyQueued:result.rows.length};
}
export async function requestAudioTranscription(userId:string,audioId:string,force=false){
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
 if(row.transcript?.trim()&&!force)return {status:'done',text:row.transcript};
 if(Number(row.byte_size)>MAX_BYTES)throw new TranscriptionFault(413,'Enregistrement trop volumineux pour la transcription gratuite (18 Mio maximum).');
 await db.execute(sql`INSERT INTO fs_audio_transcription_jobs(audio_id,status,requested_by,force)
 VALUES(${audioId}::uuid,'pending',${userId},${force})
 ON CONFLICT(audio_id) DO UPDATE SET status='pending',force=${force},attempts=0,next_attempt_at=now(),error=NULL,updated_at=now()
 WHERE fs_audio_transcription_jobs.status NOT IN ('pending','processing')`);
 return {status:'pending'};
}
export async function runTranscriptionQueue(){
 if(!transcriptionConfigured())return {configured:false,claimed:0,done:0,failed:0};
 const db=getDb();
 // Do not auto-enqueue newly submitted recordings; processing is strictly opt-in.
 const claimed=await db.execute(sql`WITH task AS (
 SELECT audio_id FROM fs_audio_transcription_jobs
 WHERE ((status='pending' AND next_attempt_at<=now())
 OR (status='processing' AND updated_at<now()-interval '20 minutes'))
 AND attempts<4
 ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE fs_audio_transcription_jobs j
 SET status='processing',attempts=j.attempts+1,updated_at=now(),error=NULL
 FROM task WHERE task.audio_id=j.audio_id RETURNING j.audio_id,j.attempts,j.force`);
 if(!claimed.rows.length)return {configured:true,claimed:0,done:0,failed:0};
 const audioId=String(claimed.rows[0].audio_id);
 const attempts=Number(claimed.rows[0].attempts);
 const force=claimed.rows[0].force===true;
 try{
  const r=await db.execute(sql`SELECT af.storage_key,af.byte_size,af.transcript,af.status
   FROM fs_audio_files af JOIN fs_answers a ON a.id=af.answer_id
   JOIN fs_submissions s ON s.id=a.submission_id JOIN fs_versions v ON v.id=s.version_id
   JOIN fs_forms f ON f.id=v.form_id WHERE af.id=${audioId}::uuid
   AND af.deleted_at IS NULL AND af.status='uploaded' AND s.deleted_at IS NULL AND f.deleted_at IS NULL
   LIMIT 1`);
  const row=r.rows[0] as {storage_key:string;byte_size:number|string;transcript:string|null;status:string}|undefined;
  if(!row)throw new TranscriptionFault(404,'Fichier audio supprimé.');
  if(row.transcript?.trim()&&!force){
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
   transcript_source='whisper',transcript_updated_at=now()
   WHERE id=${audioId}::uuid AND (transcript IS NULL OR ${force}) AND deleted_at IS NULL`);
  // Revisit previously exported Sheets rows when their transcript becomes available.
  await db.execute(sql`UPDATE fs_sheet_deliveries d SET state='pending',attempts=0,claimed_at=NULL,last_error=NULL
   WHERE d.state='done' AND d.submission_id IN (
    SELECT a.submission_id FROM fs_audio_files af
    JOIN fs_answers a ON a.id=af.answer_id WHERE af.id=${audioId}::uuid
   )`);
  await db.execute(sql`UPDATE fs_audio_transcription_jobs SET status='done',error=NULL,force=false,updated_at=now()
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
  return {configured:true,claimed:1,done:0,failed:1,quotaReached:err?.status===429};
 }
}
