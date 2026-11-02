import { ZodError } from 'zod';
import { requireUser,UnauthorizedError } from './auth';
import { AudioFault,NeonAudioService, type AudioService } from './audioService';
import { audioPrepareSchema, audioCompleteSchema } from '../shared/audio';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createAudioRestHandler(service:AudioService=new NeonAudioService(),auth:typeof requireUser=requireUser){
 return async(req:Request):Promise<Response>=>{
  try{
   const path=new URL(req.url).pathname;
   const publicMatch=path.match(/^\/api\/public\/forms\/([a-z0-9-]{1,120})\/audio\/(prepare|complete)\/?$/);
   const adminMatch=path.match(/^\/api\/audio\/([a-f0-9-]{36})\/?$/);
   if(publicMatch&&req.method==='POST'){
    if(!req.headers.get('content-type')?.startsWith('application/json'))return json({ok:false,error:{code:'INVALID_INPUT',message:'JSON obligatoire.'}},400);
    if(Number(req.headers.get('content-length')||0)>4096)return json({ok:false,error:{code:'INVALID_INPUT',message:'Requête trop longue.'}},413);
    const raw=await req.text();if(raw.length>4096)return json({ok:false,error:{code:'INVALID_INPUT',message:'Requête trop longue.'}},413);
    const payload=JSON.parse(raw);
    const isPrepare=publicMatch[2]==='prepare';
    const validated=isPrepare?audioPrepareSchema.parse(payload):audioCompleteSchema.parse(payload);
    const result=isPrepare?await service.prepare(publicMatch[1],validated):await service.complete(publicMatch[1],validated);
    return json({ok:true,data:result},publicMatch[2]==='prepare'?201:200);
   }
   if(adminMatch&&req.method==='GET'){
    const userId=await auth(req);const value=await service.access(userId,adminMatch[1]);
    return json({ok:true,data:value});
   }
   if(publicMatch||adminMatch)return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Méthode non autorisée.'}},405);
   return json({ok:false,error:{code:'NOT_FOUND',message:'Introuvable.'}},404);
  }catch(e){
   if(e instanceof UnauthorizedError)return json({ok:false,error:{code:'UNAUTHORIZED',message:'Connexion nécessaire.'}},401);
   if(e instanceof AudioFault)return json({ok:false,error:{code:e.code,message:e.message}},e.status);
   if(e instanceof ZodError||e instanceof SyntaxError)return json({ok:false,error:{code:'INVALID_INPUT',message:'Paramètres audio invalides.'}},400);
   console.error('Audio API',e instanceof Error?e.name:'unknown');
   return json({ok:false,error:{code:'UNAVAILABLE',message:'Service audio temporairement indisponible.'}},503);
  }
 };
}
