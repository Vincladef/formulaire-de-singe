import { UnauthorizedError, requireUser } from './auth';
import { folderActions, FolderNotFoundError, FolderValidationError } from './folderService';

type FolderActions = Pick<typeof folderActions,'list'|'create'|'rename'|'delete'>;
type IdentityProvider=(request:Request)=>Promise<string>;
function reply(data:unknown,status=200):Response{
 return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
async function bodyJson(request:Request):Promise<unknown>{
 if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))
  throw new FolderValidationError('Content-Type doit être application/json.');
 if(Number(request.headers.get('content-length')||'0')>4096)throw new FolderValidationError('Requête trop volumineuse.');
 const content=await request.text();
 if(content.length>4096)throw new FolderValidationError('Requête trop volumineuse.');
 try{return JSON.parse(content) as unknown;}catch{throw new FolderValidationError('Requête JSON invalide.');}
}
export function createFoldersHandler(actions:FolderActions=folderActions,identity:IdentityProvider=requireUser){
 return async(request:Request):Promise<Response>=>{
  try{
   const userId=await identity(request);
   if(!userId)throw new UnauthorizedError();
   const match=new URL(request.url).pathname.match(/^\/api\/folders(?:\/([^/]+))?\/?$/);
   if(!match)return reply({ok:false,error:{code:'NOT_FOUND',message:'Route introuvable.'}},404);
   const id=match[1];
   if(request.method==='GET'&&!id)return reply({ok:true,data:await actions.list(userId)});
   if(request.method==='POST'&&!id)return reply({ok:true,data:await actions.create(userId,await bodyJson(request))},201);
   if(request.method==='PATCH'&&id)return reply({ok:true,data:await actions.rename(userId,id,await bodyJson(request))});
   if(request.method==='DELETE'&&id)return reply({ok:true,data:await actions.delete(userId,id)});
   return reply({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Méthode non autorisée.'}},405);
  }catch(error){
   if(error instanceof UnauthorizedError)return reply({ok:false,error:{code:'UNAUTHORIZED',message:'Connexion requise.'}},401);
   if(error instanceof FolderValidationError||error instanceof FolderNotFoundError)
    return reply({ok:false,error:{code:error.code,message:error.message}},error.status);
   console.error('Folders API error',error instanceof Error?error.name:'Unknown');
   return reply({ok:false,error:{code:'INTERNAL_ERROR',message:'Service temporairement indisponible.'}},503);
  }
 };
}
