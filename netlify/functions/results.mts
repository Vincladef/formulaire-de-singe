import type { Config } from '@netlify/functions';
import { requireUser,UnauthorizedError } from '../../src/server/auth';
import { getFormResults,ResultsFault } from '../../src/server/resultsService';
export default async function handler(request:Request){
 try{
  if(request.method!=='GET')return Response.json({ok:false,error:{message:'Méthode non autorisée.'}},{status:405});
  const id=new URL(request.url).pathname.match(/^\/api\/forms\/([0-9a-f-]{36})\/results\/?$/i)?.[1];
  if(!id)return Response.json({ok:false,error:{message:'Route inconnue.'}},{status:404});
  const userId=await requireUser(request);
  const search=new URL(request.url).searchParams;
  const page=Number(search.get('page')??0),limit=Number(search.get('limit')??100);
  const data=await getFormResults(userId,id,page,limit);
  return Response.json({ok:true,data},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){
  const status=e instanceof UnauthorizedError?401:e instanceof ResultsFault?e.status:503;
  if(status===503)console.error('Results API unavailable',e instanceof Error?e.name:'unknown');
  return Response.json({ok:false,error:{message:e instanceof ResultsFault?e.message:
   status===401?'Connexion nécessaire.':'Résultats indisponibles.'}},{status,headers:{'Cache-Control':'private, no-store'}});
 }
}
export const config:Config={path:'/api/forms/:id/results',method:'GET',
 rateLimit:{aggregateBy:['ip','domain'],windowSize:60,windowLimit:90}};
