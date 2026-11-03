import {requireUser,UnauthorizedError} from './auth';
import {TranscriptionFault,getAutoTranscription,setAutoTranscription,
 requestAudioTranscription,wakeTranscriptionWorker} from './transcriptionService';

const send=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function transcriptionRestHandler(request:Request):Promise<Response>{
 try{
  const pathname=new URL(request.url).pathname;
  const form=pathname.match(/^\/api\/forms\/([0-9a-f-]{36})\/audio-transcription\/?$/i);
  const audio=pathname.match(/^\/api\/audio\/([0-9a-f-]{36})\/transcribe\/?$/i);
  if(!form&&!audio)return send({ok:false,error:{message:'Route inexistante.'}},404);
  if((form&& !['GET','POST'].includes(request.method))||(audio&&request.method!=='POST'))
   return send({ok:false,error:{message:'Méthode non autorisée.'}},405);
  const userId=await requireUser(request);
  if(form&&request.method==='GET')
   return send({ok:true,data:await getAutoTranscription(userId,form[1])});
  if(form){
   const raw=await request.json().catch(()=>null);
   if(!raw||typeof raw!=='object'||typeof raw.automatic!=='boolean')
    return send({ok:false,error:{message:'Paramètre de transcription invalide.'}},400);
   const data=await setAutoTranscription(userId,form[1],raw.automatic);
   if(data.automatic)await wakeTranscriptionWorker().catch(()=>false);
   return send({ok:true,data});
  }
  const queued=await requestAudioTranscription(userId,audio![1]);
  if(queued.status==='pending')await wakeTranscriptionWorker().catch(()=>false);
  return send({ok:true,data:queued},queued.status==='pending'?202:200);
 }catch(e){
  if(e instanceof UnauthorizedError)return send({ok:false,error:{message:'Connexion nécessaire.'}},401);
  if(e instanceof TranscriptionFault)return send({ok:false,error:{message:e.message}},e.status);
  console.error('Audio transcription API failed',e instanceof Error?e.name:'unknown');
  return send({ok:false,error:{message:'Service de transcription indisponible.'}},503);
 }
}
