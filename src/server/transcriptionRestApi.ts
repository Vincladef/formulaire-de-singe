import {requireUser,UnauthorizedError} from './auth';
import {TranscriptionFault,getTranscriptionSummary,requestFormTranscription,
 requestAudioTranscription,wakeTranscriptionWorker} from './transcriptionService';

const send=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function transcriptionRestHandler(request:Request):Promise<Response>{
 try{
  const path=new URL(request.url).pathname;
  const form=path.match(/^\/api\/forms\/([0-9a-f-]{36})\/audio-transcription\/?$/i);
  const bulk=path.match(/^\/api\/forms\/([0-9a-f-]{36})\/audio-transcription\/run\/?$/i);
  const audio=path.match(/^\/api\/audio\/([0-9a-f-]{36})\/transcribe\/?$/i);
  if(!form&&!audio&&!bulk)return send({ok:false,error:{message:'Route inexistante.'}},404);
  if((form&&request.method!=='GET')||(bulk&&request.method!=='POST')||(audio&&request.method!=='POST'))
   return send({ok:false,error:{message:'Méthode non autorisée.'}},405);
  const userId=await requireUser(request);
  if(form)return send({ok:true,data:await getTranscriptionSummary(userId,form[1])});
  if(bulk){
   const result=await requestFormTranscription(userId,bulk[1]);
   if(result.queued>0)await wakeTranscriptionWorker().catch(()=>false);
   return send({ok:true,data:result},result.queued>0?202:200);
  }
  // A retranscription is explicit. The previous transcript stays available until a new result succeeds.
  const raw=await request.text();
  if(raw.length>256)return send({ok:false,error:{message:'Requête trop volumineuse.'}},413);
  let force=false;
  if(raw){try{const v=JSON.parse(raw) as {force?:unknown};if(typeof v.force!=='boolean')throw Error();force=v.force;}catch{return send({ok:false,error:{message:'Paramètres invalides.'}},400);}}
  const queued=await requestAudioTranscription(userId,audio![1],force);
  if(queued.status==='pending')await wakeTranscriptionWorker().catch(()=>false);
  return send({ok:true,data:queued},queued.status==='pending'?202:200);
 }catch(e){
  if(e instanceof UnauthorizedError)return send({ok:false,error:{message:'Connexion nécessaire.'}},401);
  if(e instanceof TranscriptionFault)return send({ok:false,error:{message:e.message}},e.status);
  console.error('Audio transcription API failed',e instanceof Error?e.name:'unknown');
  return send({ok:false,error:{message:'Service de transcription indisponible.'}},503);
 }
}
