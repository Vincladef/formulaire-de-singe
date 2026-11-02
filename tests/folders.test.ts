import { describe, it, expect, vi } from 'vitest';
import { createFoldersHandler } from '../src/server/folderRestApi';
import { folderActions } from '../src/server/folderService';
import { createRestHandler } from '../src/server/restApi';
import { FormActions } from '../src/server/formActions';
const folderId='a7f51b76-2422-4ce5-a136-95aac3b09d8a';
const formId='b59a5089-8c0f-4251-a37a-28e337f16a61';
const now='2026-11-02T10:00:00.000Z';
const foldersStub={
 list:vi.fn().mockResolvedValue([{id:folderId,name:'Recherche',createdAt:now}]),
 create:vi.fn().mockResolvedValue({id:folderId,name:'Recherche',createdAt:now}),
 rename:vi.fn().mockResolvedValue({id:folderId,name:'Publications',createdAt:now}),
 delete:vi.fn().mockResolvedValue({id:folderId})
};
function req(url:string,method:string,body?:unknown,authorized=true){
 return new Request('https://monk-form.example'+url,{method,headers:{
  ...(authorized?{Authorization:'Bearer test'}:{}),
  ...(body===undefined?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:JSON.stringify(body)});
}
const handle=createFoldersHandler(foldersStub as typeof folderActions,async request=>{
 if(!request.headers.get('Authorization'))throw new (await import('../src/server/auth')).UnauthorizedError();
 return 'owner-user';
});
describe('dossiers protégés du Studio',()=>{
 it('refuse les accès anonymes, même pour une liste',async()=>{
  const res=await handle(req('/api/folders','GET',undefined,false));
  expect(res.status).toBe(401);
 });
 it('liste les dossiers du propriétaire uniquement',async()=>{
  const res=await handle(req('/api/folders','GET'));
  expect((await res.json()).data[0].name).toBe('Recherche');
  expect(foldersStub.list).toHaveBeenCalledWith('owner-user');
 });
 it('crée, renomme et supprime en utilisant l’identité du serveur',async()=>{
  expect((await handle(req('/api/folders','POST',{name:'Recherche'}))).status).toBe(201);
  expect(foldersStub.create).toHaveBeenCalledWith('owner-user',{name:'Recherche'});
  expect((await handle(req('/api/folders/'+folderId,'PATCH',{name:'Publications'}))).status).toBe(200);
  expect(foldersStub.rename).toHaveBeenCalledWith('owner-user',folderId,{name:'Publications'});
  expect((await handle(req('/api/folders/'+folderId,'DELETE'))).status).toBe(200);
  expect(foldersStub.delete).toHaveBeenCalledWith('owner-user',folderId);
 });
 it('rejette les méthodes et routes inconnues',async()=>{
  expect((await handle(req('/api/folders','PATCH',{name:'Oups'}))).status).toBe(405);
  expect((await handle(req('/api/folders/xyz/oops','GET'))).status).toBe(404);
 });
});
describe('déplacement privé d’un formulaire',()=>{
 it('route une mutation authentifiée vers le service avec l’identifiant utilisateur du JWT',async()=>{
  const actions={move:vi.fn().mockResolvedValue({id:formId,folderId})};
  const handler=createRestHandler(actions as unknown as FormActions,async req=>{
   if(!req.headers.get('Authorization'))throw new (await import('../src/server/auth')).UnauthorizedError();
   return 'owner-user';
  });
  const res=await handler(req('/api/forms/'+formId+'/folder','PATCH',{folderId}));
  expect(res.status).toBe(200);
  expect(actions.move).toHaveBeenCalledWith('owner-user',formId,{folderId});
  expect((await handler(req('/api/forms/'+formId+'/folder','PATCH',{folderId},false))).status).toBe(401);
 });
});
