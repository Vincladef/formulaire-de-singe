import { describe,expect,it,vi } from 'vitest';
import type { FormActions } from '../src/server/formActions';
import type { FormDetail } from '../src/shared/formApi';
import { compactForm, McpWorkflowExtras } from '../src/server/mcpWorkflowExtras';
import { compileMcpPages,mcpFormContentSchema } from '../src/shared/mcpForm';

const formId='d1a6dcf1-6573-432b-9cfa-a6a1c3c25a75';
const draftId='9574d5fb-2119-4a65-98f2-14d30969f9b3';
const pageId='b056c06b-9be3-4d9d-85fa-7e37c68b6f58';
const galleryId='f1bc04d2-6a0a-4dcc-a11a-21dc1bbcbb76';
const detail=():FormDetail=>({
 id:formId,title:'Sorties',slug:'sorties',description:null,role:'owner',folderId:null,
 versions:[{
  id:draftId,number:2,status:'draft',publishedAt:null,revision:4,rules:[],
  pages:[{id:pageId,position:0,title:'Choisir',description:null,questions:[
   {id:galleryId,position:0,type:'multiple_choice',label:'Quelles sorties ?',description:null,required:false,
    options:[{id:'7c8aa00d-e185-4c59-b9c3-be27e02da462',position:0,value:'e1',label:'Concert'},
    {id:'0494549b-8e9e-40af-93da-90be3d05a924',position:1,value:'e2',label:'Festival'}],
    settings:{logicId:'stable-gallery',choiceCards:{e1:{
     imageSrc:'data:image/jpeg;base64,'+'A'.repeat(2200000),price:'Gratuit',summary:'Un concert',url:'https://example.com/event'
    },e2:{price:'12 €',imageSrc:'https://example.com/festival.jpg'}}}},
   {id:'02d0547f-020f-42e6-9c04-d9c00b733200',position:1,type:'short_text',label:'Une précision ?',
    description:null,required:false,options:[],settings:{logicId:'stable-text'}},
  ]}],
 }],
});
const save=vi.fn(async (_owner:string,_formId:string,_payload:unknown)=>{void _owner;void _formId;void _payload;return {versionId:draftId,revision:5};});
const get=vi.fn(async()=>detail());
const actions={get,save,duplicate:vi.fn(async()=>({id:formId})),state:vi.fn(async()=>({id:formId}))} as unknown as Pick<FormActions,'get'|'save'|'duplicate'|'state'>;

describe('MCP Monk-Form pratique et économe',()=>{
 it('ne renvoie pas les mégaoctets de photos par défaut',()=>{
  const compact=compactForm(detail());
  const result=JSON.stringify(compact);
  expect(result.length).toBeLessThan(6000);
  expect(result).toContain('Gratuit');
  expect(result).toContain('e2');
  expect(result).toContain('[image intégrée masquée]');
  expect(result).not.toContain('A'.repeat(500));
  const full=compactForm(detail(),{includeMedia:true});
  expect(JSON.stringify(full).length).toBeGreaterThan(2000000);
 });
 it('crée une vraie carte avec URL d’image HTTPS, prix et description via la seule commande de création',()=>{
  const parsed=mcpFormContentSchema.parse({pages:[{questions:[
   {type:'multiple_choice',label:'Quelle sortie ?',choices:[
    {label:'Concert',imageUrl:'https://example.com/music.jpg',price:'Gratuit',
     priceNote:'Sur réservation',summary:'Concert nocturne',date:'Samedi',venue:'Paris',url:'https://example.com/event'},
    {label:'Festival',imageUrl:'https://example.com/festival.jpg',price:'12 €'},
   ]},
  ]}]});
  const pages=compileMcpPages(parsed);
  const card=pages[0].questions[0].settings.choiceCards as Record<string,Record<string,unknown>>;
  expect(card.option_1).toMatchObject({imageSrc:'https://example.com/music.jpg',price:'Gratuit',
   summary:'Concert nocturne',url:'https://example.com/event'});
  expect(card.option_2.price).toBe('12 €');
  expect(mcpFormContentSchema.safeParse({pages:[{questions:[
   {type:'multiple_choice',label:'X',choices:[{label:'A',imageUrl:'http://not-secure.test/pic.jpg'},'B']},
  ]}]}).success).toBe(false);
 });
 it('modifie une seule carte illustrée sans modifier les autres questions',async()=>{
  save.mockClear();get.mockClear();
  const extras=new McpWorkflowExtras(actions);
  const result=await extras.updateChoiceCard('owner',formId,4,galleryId,'Concert',{
   price:'8 €',priceNote:'Tarif réduit',imageUrl:'https://example.com/concert-new.jpg',
  });
  expect(result.revision).toBe(5);
  const data=save.mock.calls.at(-1)![2] as {pages:Array<{questions:Array<{settings:Record<string,unknown>}>}>};
  const card=data.pages[0].questions[0].settings.choiceCards as Record<string,Record<string,unknown>>;
  expect(card.e1.price).toBe('8 €');
  expect(card.e1.imageSrc).toBe('https://example.com/concert-new.jpg');
  expect(card.e2.price).toBe('12 €');
  expect(data.pages[0].questions[1].settings.logicId).toBe('stable-text');
 });
 it('accepte une condition en français sans demander les valeurs techniques des options',async()=>{
  save.mockClear();
  const extras=new McpWorkflowExtras(actions);
  const target='02d0547f-020f-42e6-9c04-d9c00b733200';
  await extras.setLogic('owner',formId,4,target,{
   visibility:{action:'show',match:'any',conditions:[{sourceQuestionId:galleryId,operator:'contains',value:'Concert'}]},
  });
  const data=save.mock.calls.at(-1)![2] as {pages:Array<{questions:Array<{settings:Record<string,unknown>}>}>};
  const saved=data.pages[0].questions[1].settings.logic as {visibility:{conditions:Array<{sourceKey:string;value:string}>}};
  expect(saved.visibility.conditions[0]).toEqual({sourceKey:'stable-gallery',operator:'contains',value:'e1'});
 });
 it('simule le parcours sans enregistrer une réponse',async()=>{
  const extras=new McpWorkflowExtras(actions);
  const result=await extras.preview('owner',formId,[{questionId:galleryId,value:['Concert']}]);
  expect(result.simulatedOnly).toBe(true);
  expect(result.submitted).toBe(false);
  expect(result.pages[0].questions[0].label).toBe('Quelles sorties ?');
  expect(save).not.toHaveBeenCalled();
 });
 it('refuse une révision périmée avant toute écriture',async()=>{
  save.mockClear();
  const extras=new McpWorkflowExtras(actions);
  await expect(extras.updateQuestion('owner',formId,3,galleryId,{label:'Nouveau titre'})).rejects.toThrow(/Brouillon modifié/);
  expect(save).not.toHaveBeenCalled();
 });
 it('demande une confirmation avant l’archivage',async()=>{
  const extras=new McpWorkflowExtras(actions);
  await expect(extras.archive('owner',formId,'archive',false)).rejects.toThrow(/Confirme/);
 });
});
