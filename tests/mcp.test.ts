import { describe, expect, it, vi } from 'vitest';
import { createMcpHandler, type McpIdentityProvider } from '../netlify/functions/mcp.mts';
import { FormActions } from '../src/server/formActions';
import { McpFormActions } from '../src/server/mcpFormActions';
import { UnauthorizedError } from '../src/server/auth';
import type { FormRepository } from '../src/shared/formApi';

const formId='9d6ea3f9-315c-4c1a-9dc7-4c023d99ef22';
const draftId='08b6e5c1-33ca-4d20-bb0e-c0447daf798a';
const folderId='b10555e0-814c-4e2f-bfd8-a0b55f10d556';
const userId='owner-account';
const pages=[{title:'Questionnaire',description:'Introduction',
 questions:[
  {type:'statement',label:'Merci de participer',textStyle:'heading'},
  {type:'single_choice',label:'À quelle fréquence ?',choices:['Jamais','Souvent'],required:true},
  {type:'short_text',label:'Explique ton choix',answerMode:'either'},
  {type:'audio',label:'Raconte ton expérience',maxAudioSeconds:300},
 ]}];
const detail=()=>({id:formId,title:'Mon enquête',slug:'mon-enquete',description:null,role:'owner' as const,
 versions:[{id:draftId,number:1,status:'draft' as const,publishedAt:null,revision:2,pages:[
  {id:crypto.randomUUID(),position:0,title:'Questionnaire',description:null,questions:[
   {id:crypto.randomUUID(),position:0,type:'short_text',label:'Q',description:null,required:false,settings:{},options:[]},
  ]},
 ],rules:[]}]});
const mock={
 list:vi.fn(async()=>[{id:formId,title:'Mon enquête',slug:'mon-enquete',role:'owner',
  createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}]),
 create:vi.fn(async()=>({id:formId,title:'Mon enquête',slug:'mon-enquete',draftId})),
 get:vi.fn(async()=>detail()),
 save:vi.fn(async()=>({versionId:draftId,revision:3})),
 publish:vi.fn(async()=>({publishedId:draftId,draftId:crypto.randomUUID()})),
 move:vi.fn(async()=>({id:formId,folderId})),
 rename:vi.fn(async()=>({id:formId,title:'Nouveau titre'})),
 state:vi.fn(async()=>({id:formId,action:'delete'})),
};
const folderStub={
 list:vi.fn(async()=>[{id:folderId,name:'Recherche',createdAt:new Date(0).toISOString()}]),
 create:vi.fn(async()=>({id:folderId,name:'Recherche',createdAt:new Date(0).toISOString()})),
 rename:vi.fn(async()=>({id:folderId,name:'Renommé',createdAt:new Date(0).toISOString()})),
 delete:vi.fn(async()=>({id:folderId})),
};
const actions=mock as unknown as FormActions;
const workflow=new McpFormActions(actions,folderStub);
const identity:McpIdentityProvider=async req=>{
 if(!req.headers.has('authorization'))return {userId:null};
 if(req.headers.get('authorization')!=='Bearer fake-test-credential')throw new UnauthorizedError();
 return {userId,scopes:['forms:read','forms:write','forms:publish']};
};
const handler=createMcpHandler(identity,actions,workflow);
function rpc(method:string,params:unknown,id:number,auth=true){
 return handler(new Request('https://monk-form.netlify.app/mcp',{
  method:'POST',headers:{
   ...(auth?{Authorization:'Bearer fake-test-credential'}:{}),
   'Content-Type':'application/json',Accept:'application/json, text/event-stream',
  },body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
 }));
}
async function call(name:string,args:unknown={},request=123){
 const res=await rpc('tools/call',{name,arguments:args},request);
 expect(res.status).toBe(200);
 const data=await res.json() as {result:{isError?:boolean;content:Array<{text:string}>;_meta?:unknown}};
 return data.result;
}

describe('MCP ChatGPT: full questionnaire authoring',()=>{
 it('requires authentication for private calls, but permits discovering tools without a token',async()=>{
  const list=await rpc('tools/list',{},2,false);
  expect(list.status).toBe(200);
  const data=await list.json();
  expect(data.result.tools.map((t:{name:string})=>t.name)).toContain('create_form_with_content');
  const attempted=await rpc('tools/call',{name:'list_forms',arguments:{}},3,false);
  const denied=await attempted.json();
  expect(JSON.stringify(denied)).toContain('Connecte ton compte');
  const invalid=await handler(new Request('https://monk-form.netlify.app/mcp',{
   method:'POST',headers:{Authorization:'Bearer INVALID',
    'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/list',params:{}}),
  }));
  expect(invalid.status).toBe(401);
  expect(invalid.headers.get('WWW-Authenticate')).toContain('oauth-protected-resource');
 });
 it('exposes a complete tool catalog with explicit OAuth security scopes',async()=>{
  const result=await rpc('tools/list',{},5);
  const data=await result.json();
  const names=data.result.tools.map((t:{name:string})=>t.name);
  expect(names).toContain('create_form_with_content');
  expect(names).toContain('replace_form_draft');
  expect(names).toContain('publish_form');
  expect(names).toContain('list_folders');
  expect(names).toContain('move_form_to_folder');
  expect(names).toContain('create_folder');
  const published=data.result.tools.find((t:{name:string})=>t.name==='publish_form');
  expect(JSON.stringify(published)).toContain('forms:publish');
 });
 it('creates a fully populated private draft with generated stable IDs, audio settings and options',async()=>{
  vi.clearAllMocks();
  const result=await call('create_form_with_content',{title:'Mon enquête',folderId,pages},6);
  expect(result.isError).toBeUndefined();
  const output=JSON.parse(result.content[0].text);
  expect(output.published).toBe(false);
  expect(output.formId).toBe(formId);
  expect(mock.create).toHaveBeenCalledWith(userId,{title:'Mon enquête'});
  const saved=mock.save.mock.calls.at(-1)!;
  const input=saved[2] as {versionId:string;expectedRevision:number;pages:Array<{questions:Array<{id:string;settings:Record<string,unknown>;options:Array<{value:string}>}>}>};
  expect(input.versionId).toBe(draftId);
  expect(input.expectedRevision).toBe(0);
  expect(input.pages[0].questions).toHaveLength(4);
  expect(input.pages[0].questions[1].options).toHaveLength(2);
  expect(input.pages[0].questions[2].settings.answerMode).toBe('either');
  expect(input.pages[0].questions[3].settings.maxAudioSeconds).toBe(300);
  expect(mock.move).toHaveBeenCalledWith(userId,formId,{folderId});
  expect(mock.publish).not.toHaveBeenCalled();
 });
 it('rejects malformed choice questions before creating a form',async()=>{
  vi.clearAllMocks();
  const result=await call('create_form_with_content',{title:'Bad',pages:[{questions:[{type:'select',label:'Choose'}]}]},7);
  expect(result.isError).toBe(true);
  expect(mock.create).not.toHaveBeenCalled();
 });
 it('updates a draft only with its correct optimistic revision',async()=>{
  vi.clearAllMocks();
  const incorrect=await call('replace_form_draft',{formId,expectedRevision:1,pages},8);
  expect(incorrect.isError).toBe(true);
  expect(mock.save).not.toHaveBeenCalled();
  const correct=await call('replace_form_draft',{formId,expectedRevision:2,pages},9);
  expect(correct.isError).toBeUndefined();
  expect(mock.save).toHaveBeenCalled();
 });
 it('never publishes without the user-approved boolean and current revision',async()=>{
  vi.clearAllMocks();
  const missing=await call('publish_form',{formId,expectedRevision:2},10);
  expect(missing.isError).toBe(true);
  expect(mock.publish).not.toHaveBeenCalled();
  const old=await call('publish_form',{formId,expectedRevision:1,confirm:true},11);
  expect(old.isError).toBe(true);
  const approved=await call('publish_form',{formId,expectedRevision:2,confirm:true},12);
  expect(approved.isError).toBeUndefined();
  expect(JSON.parse(approved.content[0].text).publicUrl).toBe('https://monk-form.netlify.app/f/mon-enquete');
 });
 it('lists and creates owner-scoped folders without accepting a user ID as an argument',async()=>{
  const response=await call('list_folders',{},13);
  expect(JSON.parse(response.content[0].text)[0].name).toBe('Recherche');
  expect(folderStub.list).toHaveBeenCalledWith(userId);
  await call('create_folder',{name:'Recherche'},14);
  expect(folderStub.create).toHaveBeenCalledWith(userId,{name:'Recherche'});
 });
 it('disallows publish when OAuth scopes contain only forms:read',async()=>{
  const limited=createMcpHandler(async()=>({userId,scopes:['forms:read']}),actions,workflow);
  const res=await limited(new Request('https://monk-form.netlify.app/mcp',{
   method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:15,method:'tools/call',params:{name:'publish_form',arguments:{formId,expectedRevision:2,confirm:true}}}),
  }));
  expect(JSON.stringify(await res.json())).toContain('Connecte ton compte');
 });
});
