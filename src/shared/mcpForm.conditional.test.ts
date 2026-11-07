import { describe,expect,it } from 'vitest';
import { compileMcpPages,compiledDraft,mcpFormContentSchema } from './mcpForm';
import { evaluateLogic,logicKey } from './conditionalLogic';

describe('MCP : création de questionnaires conditionnels',()=>{
 const data={
  pages:[
   {title:'Choix',questions:[{type:'single_choice' as const,label:'Combien ?',required:true,
    choices:['Aucune','Deux'],logic:{branch:{match:'all' as const,targetPage:'end' as const,conditions:[
      {sourcePage:0,sourceQuestion:0,operator:'equals' as const,value:'Aucune'}]}}}]},
   {title:'Sortie',questions:[
    {type:'statement' as const,label:'Image événement',richHtml:'<strong>Affiche</strong>'},
    {type:'short_text' as const,label:'Choisis une sortie',required:true,logic:{visibility:{action:'show' as const,match:'all' as const,conditions:[
      {sourcePage:0,sourceQuestion:0,operator:'equals' as const,value:'Deux'}]}}}
   ]}
  ]
 };
 it('résout les index en références stables et les étiquettes en valeurs',()=>{
  const parsed=mcpFormContentSchema.parse(data);
  const pages=compileMcpPages(parsed);
  const first=pages[0].questions[0],second=pages[1].questions[1];
  expect(logicKey(first)).toBeTruthy();
  expect((second.settings.logic as {visibility:{conditions:Array<{value:string;sourceKey:string}>}}).visibility.conditions[0])
   .toMatchObject({sourceKey:logicKey(first),value:'option_2'});
  expect(pages[1].questions[0].settings.richHtml).toContain('<strong>');
  expect(evaluateLogic(pages,{[first.id]:'option_1'}).pageIndices).toEqual([0]);
  expect(evaluateLogic(pages,{[first.id]:'option_2'}).pageIndices).toEqual([0,1]);
 });
 it('refuse les références introuvables et les parcours incohérents',()=>{
  const invalid=mcpFormContentSchema.parse({pages:[{questions:[
   {type:'short_text',label:'Question',logic:{visibility:{action:'show',conditions:[
    {sourcePage:5,sourceQuestion:0,operator:'equals',value:'Oui'}]}}}
  ]}]});
  expect(()=>compileMcpPages(invalid)).toThrow('introuvable');
  expect(()=>compiledDraft(invalid,crypto.randomUUID(),0)).toThrow();
 });
});
