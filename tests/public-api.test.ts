import { describe,expect,it,vi } from 'vitest';
import { createPublicRestHandler } from '../src/server/publicRestApi';
import { type PublicFormService, PublicFormFault } from '../src/server/publicFormService';
import type { PublicForm } from '../src/shared/publicForm';
import { toSubmissionAnswers, validateAnswers } from '../src/shared/publicForm';

const ids={version:'db1a59d9-3afd-46ee-8b4e-9f4db743ab1c',question:'c26879c2-b113-40a3-b352-3c3d32b426cc',date:'c6dc05c5-f881-426f-92b3-90e41303c097',nonce:'69a46f99-f1e6-45b5-944d-c07a3c13672b'};
const form:PublicForm={id:'699e9d2a-1a7d-43a5-bb53-031e34f21a43',title:'Enquête',slug:'form-test',description:'Votre avis',versionId:ids.version,versionNumber:2,requireConsent:true,pages:[
 {id:'page1',title:'Expérience',description:null,questions:[{id:ids.question,type:'short_text',label:'Pourquoi ?',description:null,required:true,options:[]}]},
 {id:'page2',title:'Date',description:null,questions:[{id:ids.date,type:'date',label:'Quand ?',description:null,required:true,options:[]}]},
]};
const good={versionId:ids.version,clientNonce:ids.nonce,consent:true,website:'',answers:[{questionId:ids.question,value:'Une réponse'},{questionId:ids.date,value:'2026-11-02'}]};
const service:PublicFormService={get:vi.fn(async slug=>slug==='form-test'?form:null),submit:vi.fn(async (_slug,input)=>({id:'28ff7a70-909a-44ae-87ec-b05c60ca37ef',alreadySubmitted:input.clientNonce===ids.nonce}))};
const call=(method:string,path:string,body?:unknown)=>createPublicRestHandler(service)(new Request(`https://exemple.test${path}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}));

describe('Formulaires publics, sans identité',()=>{
 it('retourne uniquement les données publiées de la façade publique',async()=>{
  const result=await call('GET','/api/public/forms/form-test');expect(result.status).toBe(200);
  const data=await result.json();expect(data.data.versionId).toBe(ids.version);
  expect(data.data.pages).toHaveLength(2);expect(JSON.stringify(data)).not.toContain('ownerId');
 });
 it('masque un formulaire absent, brouillon ou archivé',async()=>{
  expect((await call('GET','/api/public/forms/introuvable')).status).toBe(404);
 });
 it('valide les réponses sur deux pages et le format des dates',()=>{
  expect(validateAnswers(form,{[ids.question]:'Oui',[ids.date]:'2026-11-02'})).toEqual({});
  expect(validateAnswers(form,{[ids.question]:'', [ids.date]:'2026-02-31'})[ids.date]).toBeTruthy();
  expect(toSubmissionAnswers(form,{[ids.question]:'Oui',[ids.date]:'2026-11-02'})).toHaveLength(2);
 });
 it('refuse les mauvaises méthodes et les requêtes mal formées',async()=>{
  expect((await call('DELETE','/api/public/forms/form-test')).status).toBe(405);
  expect((await call('POST','/api/public/forms/form-test/submissions',{versionId:'fake'})).status).toBe(400);
 });
 it('ne requiert aucun jeton pour recevoir une réponse conforme',async()=>{
  const r=await call('POST','/api/public/forms/form-test/submissions',good);
  expect(r.status).toBe(200);expect(service.submit).toHaveBeenCalledWith('form-test',good);
 });
 it('n’expose pas les erreurs internes',async()=>{
  const failing:PublicFormService={get:async()=>form,submit:async()=>{throw new Error('DATABASE_URL=SECRET');}};
  const r=await createPublicRestHandler(failing)(new Request('https://example.test/api/public/forms/form-test/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(good)}));
  expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain('SECRET');
 });
 it('retourne une erreur explicite pour les soumissions refusées',async()=>{
  const rejected:PublicFormService={get:async()=>form,submit:async()=>{throw new PublicFormFault(409,'CONFLICT','Soumission déjà existante');}};
  const r=await createPublicRestHandler(rejected)(new Request('https://example.test/api/public/forms/form-test/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(good)}));
  expect(r.status).toBe(409);
 });
});
