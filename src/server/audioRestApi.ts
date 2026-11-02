import { ZodError } from 'zod';
import { requireUser,UnauthorizedError } from './auth';
import { AudioFault, prepareAudio,uploadAudioPart,completeAudio,getAudioForUser,listAudioForUser } from './audioService';
import { audioPrepareSchema,audioCompleteSchema } from '../shared/audio';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function audioRestHandler(request:Request):Promise<Response>{
 try{
  const url=new URL(request.url),path=url.pathname;
  const prepare=path.match(/^\/api\/public\/forms\/([a-z0-9-]{1,120})\/audio\/(prepare|complete)\/?$/);
  const chunk=path.match(/^\/api\/public\/forms\/([a-z0-9-]{1,120})\/audio\/([0-9a-f-]{36})\/parts\/([0-9]{1,2})\/?$/);
  const playback=path.match(/^\/api\/audio\/([0-9a-f-]{36})\/?$/);
  if(prepare&&request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({ok:false,error:{code:'INVALID_INPUT',message:'JSON requis.'}},400);
   if(Number(request.headers.get('content-length')??0)>4096)return reply({ok:false,error:{code:'TOO_LARGE',message:'Requête trop volumineuse.'}},413);
   const raw=await request.text();if(raw.length>4096)return reply({ok:false,error:{code:'TOO_LARGE',message:'Requête trop volumineuse.'}},413);
   const input=JSON.parse(raw);
   return reply({ok:true,data:prepare[2]==='prepare'?await prepareAudio(prepare[1],audioPrepareSchema.parse(input)):
    await completeAudio(prepare[1],audioCompleteSchema.parse(input))},prepare[2]==='prepare'?201:200);
  }
  if(chunk&&request.method==='POST'){
   const nonce=request.headers.get('x-audio-nonce')??'',claim=request.headers.get('x-audio-claim')??'';
   return reply({ok:true,data:await uploadAudioPart(chunk[1],chunk[2],Number(chunk[3]),nonce,claim,request)});
  }
  if(path==='/api/audio'&&request.method==='GET'){
   const userId=await requireUser(request);
   return reply({ok:true,data:await listAudioForUser(userId)});
  }
  if(playback&&request.method==='GET'){
   const userId=await requireUser(request);
   const audio=await getAudioForUser(userId,playback[1]);
   return new Response(audio.blob.stream(),{status:200,headers:{
    'Content-Type':audio.type,'Content-Length':String(audio.blob.size),
    'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
   }});
  }
  if(prepare||chunk||playback||path==='/api/audio')return reply({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Méthode non autorisée.'}},405);
  return reply({ok:false,error:{code:'NOT_FOUND',message:'Route inexistante.'}},404);
 }catch(e){
  if(e instanceof UnauthorizedError)return reply({ok:false,error:{code:'UNAUTHORIZED',message:'Connexion nécessaire.'}},401);
  if(e instanceof AudioFault)return reply({ok:false,error:{code:e.code,message:e.message}},e.status);
  if(e instanceof SyntaxError||e instanceof ZodError)return reply({ok:false,error:{code:'INVALID_INPUT',message:'Paramètres audio invalides.'}},400);
  console.error('Audio API failure',e instanceof Error?e.name:'unknown');
  return reply({ok:false,error:{code:'UNAVAILABLE',message:'Service audio indisponible.'}},503);
 }
}
