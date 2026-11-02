import { describe, expect, it, vi } from 'vitest';
import { createResultsRestHandler } from '../src/server/resultsRestApi';
import { UnauthorizedError } from '../src/server/auth';
import { ResultsFault, type ResultsService } from '../src/server/resultsRepository';
import { csvOfSubmissions, resultsFilterSchema, type SubmissionDetail } from '../src/shared/results';

const form='11111111-1111-4111-8111-111111111111';
const submission='22222222-2222-4222-8222-222222222222';
const audio='33333333-3333-4333-8333-333333333333';
const filters={limit:30,offset:0};
const detail:SubmissionDetail={id:submission,versionId:form,versionNumber:1,submittedAt:'2026-11-02T10:00:00.000Z',answers:[
 {id:audio,questionId:form,label:'Votre retour',type:'long_text',position:0,value:'=1+1',audio:null},
]};
function mockService():ResultsService {
 return {
  overview:vi.fn(async()=>({formId:form,title:'Enquête',total:1,submissions:[],versions:[],questions:[],limit:30,offset:0,hasMore:false,completionRate:null})),
  submission:vi.fn(async()=>detail),
  question:vi.fn(async()=>({total:0,answers:[]})),
  transcript:vi.fn(async()=>({id:audio,updated:true})),
  removeSubmission:vi.fn(async()=>({deleted:true,pendingAudioCleanup:0})),
  export:vi.fn(async()=>({filename:'test.csv',content:csvOfSubmissions([detail]),contentType:'text/csv; charset=utf-8'})),
 };
}
const path=`https://localhost/api/forms/${form}/results`;
describe('Results API : identité, accès et exports',()=>{
 it('refuse toute lecture avant la consultation du service sans authentification',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>{throw new UnauthorizedError();});
  const result=await handler(new Request(path));expect(result.status).toBe(401);expect(service.overview).not.toHaveBeenCalled();
 });
 it('refuse un utilisateur absent ou non authentifié',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'');
  const result=await handler(new Request(path));expect(result.status).toBe(401);expect(service.overview).not.toHaveBeenCalled();
 });
 it('ne divulgue pas les résultats d’un autre propriétaire',async()=>{
  const service=mockService();service.overview=vi.fn(async()=>{throw new ResultsFault(404,'NOT_FOUND','Introuvable');});
  const handler=createResultsRestHandler(service,async()=>'attacker');const result=await handler(new Request(path));
  expect(result.status).toBe(404);expect(JSON.stringify(await result.json())).not.toContain('Enquête');
 });
 it('passe identité et filtres validés au service',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}?from=2026-11-01&to=2026-11-03&limit=10`));
  expect(result.status).toBe(200);expect(service.overview).toHaveBeenCalledWith('owner',form,{from:'2026-11-01',to:'2026-11-03',limit:10,offset:0});
 });
 it('rejette les plages inversées',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}?from=2026-11-03&to=2026-11-01`));
  expect(result.status).toBe(400);expect(service.overview).not.toHaveBeenCalled();
 });
 it('oblige la confirmation explicite pour supprimer une participation',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}/submissions/${submission}/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'oui'})}));
  expect(result.status).toBe(400);expect(service.removeSubmission).not.toHaveBeenCalled();
 });
 it('supprime seulement la participation désignée, via le service privé',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}/submissions/${submission}/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'SUPPRIMER'})}));
  expect(result.status).toBe(200);expect(service.removeSubmission).toHaveBeenCalledWith('owner',form,submission);
 });
 it('ne laisse pas modifier une transcription sans texte ni origine valide',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}/audios/${audio}/transcript`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'  ',source:'chatgpt'})}));
  expect(result.status).toBe(400);expect(service.transcript).not.toHaveBeenCalled();
 });
 it('exporte un CSV protégé contre les formules tableur',async()=>{
  const service=mockService();const handler=createResultsRestHandler(service,async()=>'owner');
  const result=await handler(new Request(`${path}/export/csv`));const exported=await result.text();
  expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toContain('no-store');expect(exported).toContain("'=1+1");
  expect(exported).not.toContain('r2.cloudflarestorage.com');
 });
});
describe('Résultats : filtres et CSV',()=>{
 it('defaults vérifiés',()=>expect(resultsFilterSchema.parse({})).toEqual(filters));
 it('rejette un jour inexistant',()=>expect(resultsFilterSchema.safeParse({from:'2026-02-30'}).success).toBe(false));
 it('associe réponse, question et audio sans URL de stockage',()=>{
  const csv=csvOfSubmissions([detail]);expect(csv).toContain(submission);expect(csv).toContain(`${form}:answer`);expect(csv).not.toContain('https://');
 });
});

describe('Exports structurés',()=>{
 it('préserve les identifiants des audios et transcriptions',()=>{
  const extra:SubmissionDetail={...detail,answers:[{...detail.answers[0],value:{kind:'audio'},audio:{id:audio,mimeType:'audio/webm',durationMs:8500,bytes:1024,transcript:'Bonjour',transcriptSource:'noscribe'}}]};
  const csv=csvOfSubmissions([extra]);expect(csv).toContain(audio);expect(csv).toContain('Bonjour');expect(csv).toContain('[audio]');
 });
});
