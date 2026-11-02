import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpHandler } from '../netlify/functions/mcp.mts';
import { UnauthorizedError } from '../src/server/auth';
import { NotFoundFault, ValidationFault, type FormActions } from '../src/server/formActions';
import { ResultsFault, type ResultsService } from '../src/server/resultsRepository';
import { AudioFault, type AudioService } from '../src/server/audioService';
import type { FormDetail } from '../src/shared/formApi';
import type { DraftPayload } from '../src/shared/studio';

const formId='9d6ea3f9-315c-4c1a-9dc7-4c023d99ef22';
const draftId='08b6e5c1-33ca-4d20-bb0e-c0447daf798a';
const pageId='3bef4fea-1f3a-4faf-8abf-0a2cd8cd9521';
const questionId='1acf250d-17b6-4d3a-ae21-7b1c8b0ab805';
const submissionId='237e925a-fd3a-4420-9aa9-114ec7f6a13a';
const audioId='a59483b1-dd5b-4678-8cae-1b52e0b56c84';

function fixture(){
 let detail:FormDetail={id:formId,title:'Questionnaire test',slug:'questionnaire-test',description:null,role:'owner',versions:[{id:draftId,number:1,status:'draft',revision:0,publishedAt:null,pages:[{id:pageId,position:0,title:'Introduction',description:null,questions:[{id:questionId,position:0,type:'short_text',label:'Votre avis ?',description:null,required:false,settings:{},options:[]}]}],rules:[]}]};
 const calls:string[]=[];
 const formActions={
  list:async(user:string)=>{calls.push('list_forms');return user==='owner'?[{id:formId,title:detail.title,slug:detail.slug,role:'owner',createdAt:'2026-11-02',updatedAt:'2026-11-02'}]:[];},
  create:async(user:string,v:{title:string})=>{calls.push('create_form');if(user!=='owner')throw new NotFoundFault('Non autorisé');return {id:formId,title:v.title,slug:detail.slug,draftId};},
  get:async(user:string,id:string)=>{calls.push('get_form');if(user!=='owner'||id!==formId)throw new NotFoundFault('Non autorisé');return structuredClone(detail);},
  rename:async(user:string,id:string,input:{title:string})=>{if(user!=='owner'||id!==formId)throw new NotFoundFault('Non autorisé');detail.title=input.title;calls.push('update_form');return {id,title:detail.title};},
  theme:async(user:string)=>{if(user!=='owner')throw new NotFoundFault('Non autorisé');calls.push('theme');return {id:formId};},
  save:async(user:string,id:string,input:DraftPayload)=>{if(user!=='owner'||id!==formId)throw new NotFoundFault('Non autorisé');const draft=detail.versions[0];if(input.expectedRevision!==draft.revision)throw new ValidationFault('Conflit');draft.revision=(draft.revision??0)+1;draft.pages=input.pages.map((p,i)=>({...p,position:i,questions:p.questions.map((q,j)=>({...q,position:j,options:q.options.map((o,k)=>({...o,position:k}))}))}));calls.push('save_draft');return {versionId:draftId,revision:draft.revision};},
  publish:async(user:string)=>{if(user!=='owner')throw new NotFoundFault('Non autorisé');calls.push('publish_form');detail.versions[0].status='published';return {publishedId:draftId,draftId:'c330e86e-d18a-4315-8d08-4bd919acecbd'};},
 } as unknown as FormActions;
 const results={
  overview:async(user:string)=>{if(user!=='owner')throw new ResultsFault(404,'NOT_FOUND','Non autorisé');calls.push('list_submissions');return {formId,total:1,submissions:[{id:submissionId}]};},
  submission:async(user:string)=>{if(user!=='owner')throw new ResultsFault(404,'NOT_FOUND','Non autorisé');calls.push('get_submission');return {id:submissionId,answers:[{questionId,value:'Test'}]};},
  export:async(user:string,_id:string,_filters:unknown,format:string)=>{if(user!=='owner')throw new ResultsFault(404,'NOT_FOUND','Non autorisé');calls.push('export_results');return {content:format==='csv'?'"value"\r\n"test"':'{"submissions":[]}',contentType:'text/plain',filename:`test.${format}`};},
 } as unknown as ResultsService;
 const audio={access:async(user:string)=>{if(user!=='owner')throw new AudioFault(404,'NOT_FOUND','Non autorisé');calls.push('get_audio');return {url:'https://temporary.example/signed?expires=60',expiresIn:60};}} as unknown as AudioService;
 const handler=createMcpHandler(async r=>{
   if(r.headers.get('Authorization')==='Bearer owner')return 'owner';
   if(r.headers.get('Authorization')==='Bearer other')return 'other';
   throw new UnauthorizedError();
 },formActions,{results,audio});
 const rpc=async (method:string,params:unknown={},credential='owner')=>{
  const response=await handler(new Request('https://formulaire-de-singe.netlify.app/mcp',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
  return {status:response.status,json:await response.json()};
 };
 const call=(name:string,args:unknown={},who='owner')=>rpc('tools/call',{name,arguments:args},who);
 return {handler,rpc,call,calls,formActions};
}

describe('Formulaire de Singe : MCP 0.9',()=>{
 let f:ReturnType<typeof fixture>;
 beforeEach(()=>{f=fixture();});
 it('refuse un jeton absent et publie la découverte OAuth gérée',async()=>{
   const res=await f.handler(new Request('https://formulaire-de-singe.netlify.app/mcp',{method:'POST'}));
   expect(res.status).toBe(401);
   expect(res.headers.get('WWW-Authenticate')).toContain('oauth-protected-resource/mcp');
 });
 it('refuse GET /mcp et ne déclenche jamais un flux SSE non borné',async()=>{
   expect((await f.handler(new Request('https://formulaire-de-singe.netlify.app/mcp'))).status).toBe(405);
 });
 it('réalise le handshake MCP et expose les onze outils',async()=>{
   const init=await f.rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'vitest',version:'1'}});
   expect(init.status).toBe(200);expect(init.json.result.serverInfo.name).toBe('formulaire-de-singe');
   const tools=await f.rpc('tools/list');
   expect(tools.json.result.tools.map((t:{name:string})=>t.name).sort()).toEqual(['add_questions','create_form','export_results','get_audio','get_form','get_submission','list_forms','list_submissions','publish_form','update_form','update_question']);
 });
 it('list_forms : liste uniquement les données autorisées',async()=>{
   expect((await f.call('list_forms')).json.result.structuredContent.data).toHaveLength(1);
   expect((await f.call('list_forms',{},'other')).json.result.structuredContent.data).toHaveLength(0);
 });
 it('create_form : brouillon privé',async()=>{
   expect((await f.call('create_form',{title:'Anxiété sociale'})).json.result.structuredContent.data.title).toBe('Anxiété sociale');
 });
 it('get_form : lecture de structure autorisée, accès tiers refusé',async()=>{
   expect((await f.call('get_form',{id:formId})).json.result.structuredContent.data.versions[0].pages[0].id).toBe(pageId);
   expect((await f.call('get_form',{id:formId},'other')).json.result.isError).toBe(true);
 });
 it('update_form : renomme sans contourner les permissions',async()=>{
   expect((await f.call('update_form',{formId,title:'Titre révisé'})).json.result.structuredContent.data.title).toBe('Titre révisé');
   expect((await f.call('update_form',{formId,title:'Intrusion'},'other')).json.result.isError).toBe(true);
 });
 it('add_questions : ajoute cinq questions à choix avec révision',async()=>{
   const questions=Array.from({length:5},(_,i)=>({type:'single_choice',label:`Question ${i+1}`,options:['Oui','Non']}));
   const r=await f.call('add_questions',{formId,pageId,expectedRevision:0,questions});
   expect(r.json.result.structuredContent.data.questions).toHaveLength(5);
   expect((await f.call('get_form',{id:formId})).json.result.structuredContent.data.versions[0].pages[0].questions).toHaveLength(6);
   expect((await f.call('add_questions',{formId,expectedRevision:0,questions})).json.result.isError).toBe(true);
 });
 it('update_question : ajuste une question audio, sans toucher à la version publiée',async()=>{
   const r=await f.call('update_question',{formId,questionId,expectedRevision:0,patch:{label:'Décrivez votre avis',settings:{answerMode:'either'}}});
   expect(r.json.result.structuredContent.data.question.settings.answerMode).toBe('either');
 });
 it('publish_form : rejette sans confirmation, publie avec confirmation',async()=>{
   expect((await f.call('publish_form',{formId,confirmPublication:false})).json.result.isError).toBe(true);
   expect(f.calls).not.toContain('publish_form');
   const r=await f.call('publish_form',{formId,confirmPublication:true});
   expect(r.json.result.structuredContent.data.publishedUrl).toContain('/f/questionnaire-test');
   expect(f.calls).toContain('publish_form');
 });
 it('list_submissions : renvoie l’aperçu privé',async()=>{
   expect((await f.call('list_submissions',{formId})).json.result.structuredContent.data.total).toBe(1);
 });
 it('get_submission : renvoie une participation autorisée',async()=>{
   expect((await f.call('get_submission',{formId,submissionId})).json.result.structuredContent.data.answers).toHaveLength(1);
 });
 it('get_audio : fournit uniquement une URL à expiration courte',async()=>{
   const out=(await f.call('get_audio',{audioId})).json.result.structuredContent.data;
   expect(out.expiresIn).toBe(60);expect(out.url).toContain('signed');
 });
 it('export_results : CSV/JSON sans lien privé permanent',async()=>{
   expect((await f.call('export_results',{formId,format:'csv'})).json.result.structuredContent.data.content).toContain('test');
   expect((await f.call('export_results',{formId,format:'json'})).json.result.structuredContent.data.filename).toBe('test.json');
 });
});
