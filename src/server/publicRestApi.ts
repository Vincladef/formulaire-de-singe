import { ZodError } from 'zod';
import { publicSubmitSchema } from '../shared/publicForm';
import { NeonPublicFormService, PublicFormFault, type PublicFormService } from './publicFormService';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createPublicRestHandler(service:PublicFormService=new NeonPublicFormService()){
 return async(request:Request):Promise<Response>=>{
  try{
   const match=new URL(request.url).pathname.match(/^\/api\/public\/forms\/([a-z0-9-]{1,120})(?:\/(submissions))?\/?$/);
   if(!match)return json({ok:false,error:{code:'NOT_FOUND',message:'Page introuvable.'}},404);
   const slug=match[1];const operation=match[2];
   if(request.method==='GET'&&!operation){const form=await service.get(slug);return form?json({ok:true,data:form}):json({ok:false,error:{code:'NOT_FOUND',message:'Ce formulaire n’est pas disponible.'}},404);}
   if(request.method==='POST'&&operation==='submissions'){
    if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))return json({ok:false,error:{code:'VALIDATION_ERROR',message:'Format JSON obligatoire.'}},400);
    if(Number(request.headers.get('content-length')??0)>200_000)return json({ok:false,error:{code:'VALIDATION_ERROR',message:'La réponse est trop volumineuse.'}},413);
    const raw=await request.text();if(raw.length>200_000)return json({ok:false,error:{code:'VALIDATION_ERROR',message:'La réponse est trop volumineuse.'}},413);
    const parsed=publicSubmitSchema.parse(JSON.parse(raw));
    const submitted=await service.submit(slug,parsed);
    return json({ok:true,data:submitted},submitted.alreadySubmitted?200:201);
   }
   return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Méthode non autorisée.'}},405);
  }catch(error){
   if(error instanceof PublicFormFault)return json({ok:false,error:{code:error.code,message:error.message}},error.status);
   if(error instanceof SyntaxError||error instanceof ZodError)return json({ok:false,error:{code:'VALIDATION_ERROR',message:'Les données envoyées ne sont pas valides.'}},400);
   console.error('Public forms API error',error instanceof Error?error.name:'Unknown');
   return json({ok:false,error:{code:'UNAVAILABLE',message:'Le service est indisponible. Réessayez plus tard.'}},503);
  }
 };
}
