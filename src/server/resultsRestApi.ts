import { ZodError } from 'zod';
import { deletionInputSchema, resultsFilterSchema, transcriptInputSchema, uuidSchema } from '../shared/results';
import { requireUser, UnauthorizedError } from './auth';
import { NeonResultsService, ResultsFault, type ResultsService } from './resultsRepository';

const json = (value:unknown,status=200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail = (status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
async function body(req:Request) {
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ResultsFault(415,'UNSUPPORTED_MEDIA','Un document JSON est attendu.');
  if(Number(req.headers.get('content-length')??0)>125000)throw new ResultsFault(413,'TOO_LARGE','Texte trop volumineux.');
  const text=await req.text();if(text.length>125000)throw new ResultsFault(413,'TOO_LARGE','Texte trop volumineux.');
  return JSON.parse(text) as unknown;
}
export type ResultsIdentity = (request:Request)=>Promise<string>;
export function createResultsRestHandler(service:ResultsService=new NeonResultsService(),identity:ResultsIdentity=requireUser) {
 return async(request:Request):Promise<Response>=>{
  try {
   // Authenticate BEFORE any export, database query or data access, including invalid resource IDs.
   const userId=await identity(request);if(!userId)throw new UnauthorizedError();
   const url=new URL(request.url);const parts=url.pathname.split('/').filter(Boolean);
   if(parts[0]!=='api'||parts[1]!=='forms'||parts[3]!=='results')return fail(404,'NOT_FOUND','Route inconnue.');
   const formId=uuidSchema.parse(parts[2]);
   const filters=resultsFilterSchema.parse(Object.fromEntries(url.searchParams.entries()));
   const method=request.method;
   if(parts.length===4&&method==='GET')return json({ok:true,data:await service.overview(userId,formId,filters)});
   if(parts[4]==='submissions'&&parts.length===6&&method==='GET')return json({ok:true,data:await service.submission(userId,formId,uuidSchema.parse(parts[5]))});
   if(parts[4]==='submissions'&&parts[6]==='delete'&&parts.length===7&&method==='POST'){
     deletionInputSchema.parse(await body(request));const value=await service.removeSubmission(userId,formId,uuidSchema.parse(parts[5]));
     return json({ok:true,data:value},value.pendingAudioCleanup?202:200);
   }
   if(parts[4]==='questions'&&parts.length===6&&method==='GET')return json({ok:true,data:await service.question(userId,formId,uuidSchema.parse(parts[5]),filters)});
   if(parts[4]==='audios'&&parts[6]==='transcript'&&parts.length===7&&method==='PUT'){
     const v=transcriptInputSchema.parse(await body(request));
     return json({ok:true,data:await service.transcript(userId,formId,uuidSchema.parse(parts[5]),v.text,v.source)});
   }
   if(parts[4]==='export'&&parts.length===6&&method==='GET'&&['csv','json','zip'].includes(parts[5])){
     const file=await service.export(userId,formId,filters,parts[5] as 'csv'|'json'|'zip');
     const b=typeof file.content==='string'?file.content:(new Uint8Array(file.content).buffer as ArrayBuffer);
     return new Response(b,{status:200,headers:{'Content-Type':file.contentType,'Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   return fail(405,'METHOD_NOT_ALLOWED','Opération indisponible.');
  } catch(error) {
    if(error instanceof UnauthorizedError)return fail(401,'UNAUTHORIZED','Connexion nécessaire.');
    if(error instanceof ResultsFault)return fail(error.status,error.code,error.message);
    if(error instanceof ZodError || error instanceof SyntaxError)return fail(400,'VALIDATION_ERROR','Paramètres invalides.');
    console.error('Results API:',error instanceof Error?error.name:'unexpected');
    return fail(503,'UNAVAILABLE','Les résultats sont momentanément indisponibles.');
  }
 };
}
