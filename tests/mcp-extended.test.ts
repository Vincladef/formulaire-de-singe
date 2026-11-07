import { describe,expect,it } from 'vitest';
import { formAppearanceSchema,readFormAppearance } from '../src/shared/formAppearance';
import { compileMcpPages,mcpQuestionSchema } from '../src/shared/mcpForm';
import { createMcpHandler } from '../netlify/functions/mcp.mts';

describe('Advanced MCP: typed themes and targeted response tools',()=>{
 it('validates hexadecimal colors, font choices and text lengths',()=>{
  expect(formAppearanceSchema.parse({accent:'#286846',font:'serif'})).toEqual({accent:'#286846',font:'serif'});
  expect(formAppearanceSchema.safeParse({accent:'red; background:url(javascript:1)'}).success).toBe(false);
  expect(formAppearanceSchema.safeParse({customCss:'* {display:none}'}).success).toBe(false);
  expect(readFormAppearance({appearance:{accent:'#125678'}})).toEqual({accent:'#125678'});
  expect(readFormAppearance({appearance:{accent:'bad'}})).toEqual({});
 });
 it('supports compact optional written supplements on audio questions',()=>{
  const q=mcpQuestionSchema.parse({type:'audio',label:'Décrivez votre ressenti',allowTextSupplement:true,maxAudioSeconds:30});
  const pages=compileMcpPages({pages:[{questions:[q]}]});
  expect(pages[0].questions[0].settings.allowTextSupplement).toBe(true);
  expect(pages[0].questions[0].settings.maxAudioSeconds).toBe(30);
  expect(mcpQuestionSchema.safeParse({type:'date',label:'Date',allowTextSupplement:true}).success).toBe(false);
 });
 it('never duplicates the free-text Other choice if it was explicitly supplied',()=>{
  const pages=compileMcpPages({pages:[{questions:[{
   type:'single_choice',label:'Votre préférence ?',choices:['Oui','Autre'],allowOther:true,
  }]}]});
  const items=pages[0].questions[0].options;
  expect(items).toHaveLength(2);
  expect(items.filter(x=>x.label==='Autre')).toHaveLength(1);
  expect(items.find(x=>x.label==='Autre')?.value).toBe('__other__');
 });
 it('advertises analytics, precise answers and styling with appropriate OAuth scopes',async()=>{
  const handler=createMcpHandler(async()=>({userId:'test',scopes:['forms:read','forms:write','forms:publish']}));
  const response=await handler(new Request('https://monk-form.netlify.app/mcp',{
   method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),
  }));
  expect(response.status).toBe(200);
  const data=await response.json() as {result:{tools:Array<{name:string;_meta?:unknown}>}};
  const names=data.result.tools.map(x=>x.name);
  for(const name of ['get_form_analytics','get_submission','get_form_appearance','set_form_appearance'])
   expect(names).toContain(name);
  const edit=data.result.tools.find(x=>x.name==='set_form_appearance');
  expect(JSON.stringify(edit)).toContain('forms:write');
 });
});
