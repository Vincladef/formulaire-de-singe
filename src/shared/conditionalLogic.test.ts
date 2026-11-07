import { describe, expect, it } from 'vitest';
import { evaluateLogic, validateConditionalSettings, type LogicPage } from './conditionalLogic';
import { toSubmissionAnswers, validateAnswers, type PublicForm, type PublicQuestion } from './publicForm';
import type { StudioPageData } from './studio';

const source={id:'source-id',type:'single_choice' as const,required:true,
 settings:{logicId:'persistent-source'},options:[{value:'0',label:'Aucune'},{value:'1',label:'Une'},{value:'2',label:'Deux'}],
 label:'Combien de sorties ?',description:null};
const choice={id:'first-id',type:'short_text' as const,required:true,
 settings:{logicId:'persistent-first',logic:{visibility:{action:'show',match:'all',conditions:[{sourceKey:'persistent-source',operator:'not_equals',value:'0'}]}}},
 options:[],label:'Sortie 1',description:null};
const second={id:'second-id',type:'short_text',required:true,
 settings:{logicId:'persistent-second',logic:{visibility:{action:'show',match:'all',conditions:[{sourceKey:'persistent-source',operator:'equals',value:'2'}]}}},
 options:[],label:'Sortie 2',description:null};
const pages:LogicPage<PublicQuestion>[]=[{id:'page-one',questions:[source]},
 {id:'page-two',questions:[choice]},
 {id:'page-three',questions:[second]}];
const asForm=():PublicForm=>({id:'form',slug:'sorties',title:'Sorties',description:null,versionId:'version',versionNumber:1,requireConsent:false,
 pages:pages.map((p,i)=>({id:p.id,title:'Étape '+i,description:null,questions:p.questions}))});

describe('parcours conditionnels',()=>{
 it('ignore les pages et champs cachés lorsque aucun projet est choisi',()=>{
  const answers={'source-id':'0','first-id':'stale-value','second-id':'stale-value'};
  const route=evaluateLogic(pages,answers);
  expect(route.pageIndices).toEqual([0]);
  expect(route.visibleIds.has('first-id')).toBe(false);
  expect(validateAnswers(asForm(),answers)).toEqual({});
  expect(toSubmissionAnswers(asForm(),answers)).toEqual([{questionId:'source-id',value:'0'}]);
 });
 it('montre une étape ou deux selon les choix et ignore les champs obligatoires masqués',()=>{
  expect(evaluateLogic(pages,{'source-id':'1'}).pageIndices).toEqual([0,1]);
  expect(evaluateLogic(pages,{'source-id':'2'}).pageIndices).toEqual([0,1,2]);
  expect(validateAnswers(asForm(),{'source-id':'1'})).toHaveProperty('first-id');
  expect(validateAnswers(asForm(),{'source-id':'1'})).not.toHaveProperty('second-id');
 });
 it('ne laisse pas un ancien choix caché déclencher une autre condition',()=>{
  const form=[{id:'first',questions:[source]},
    {id:'middle',questions:[{...choice,id:'middle-id',settings:{logicId:'middle',logic:{visibility:{action:'show' as const,match:'all' as const,conditions:[{sourceKey:'persistent-source',operator:'equals' as const,value:'2'}]}}}}]},
    {id:'last',questions:[{...second,settings:{logicId:'last',logic:{visibility:{action:'show' as const,match:'all' as const,conditions:[{sourceKey:'middle',operator:'not_empty' as const}]}}}}]}];
  const result=evaluateLogic(form,{'source-id':'0','middle-id':'ancient answer'});
  expect(result.pageIndices).toEqual([0]);
 });
 it('applique une condition obligatoire sans changer les autres questions',()=>{
  const config={...choice,required:false,settings:{logicId:'choice-required',logic:{requiredWhen:{match:'all' as const,conditions:[{sourceKey:'persistent-source',operator:'equals' as const,value:'2'}]}}}};
  const simple={...asForm(),pages:[{id:'a',title:'A',description:null,questions:[source,config]}]};
  expect(validateAnswers(simple,{'source-id':'1'})).toEqual({});
  expect(validateAnswers(simple,{'source-id':'2'})).toHaveProperty('first-id');
 });
 it('applique les conditions OU et prend en charge les réponses multiples',()=>{
  const multi={...source,type:'multiple_choice',options:[{value:'a',label:'A'},{value:'b',label:'B'}]};
  const conditional={...choice,settings:{logicId:'second',logic:{visibility:{action:'show' as const,match:'any' as const,conditions:[
    {sourceKey:'persistent-source',operator:'equals' as const,value:'a'},
    {sourceKey:'persistent-source',operator:'equals' as const,value:'b'}]}}}};
  expect(evaluateLogic([{id:'a',questions:[multi,conditional]}],{'source-id':['b']}).visibleIds.has('first-id')).toBe(true);
 });
 it('permet le saut direct vers la fin du questionnaire',()=>{
  const withJump={...source,settings:{logicId:'persistent-source',logic:{branch:{target:'END',match:'all' as const,conditions:[{sourceKey:'persistent-source',operator:'equals' as const,value:'0'}]}}}};
  expect(evaluateLogic([{id:'a',questions:[withJump]},pages[1],pages[2]],{'source-id':'0'}).pageIndices).toEqual([0]);
 });
 it('conserve les références après duplication d’une version publiée',()=>{
  const replacement=pages.map(p=>({...p,questions:p.questions.map(q=>({...q,id:q.id+'-new'}))}));
  expect(evaluateLogic(replacement,{'source-id-new':'2'}).pageIndices).toEqual([0,1,2]);
 });
});

describe('vérification des règles dans le Studio',()=>{
 const asStudio=(input:LogicPage<PublicQuestion>[]):StudioPageData[]=>
  input.map(p=>({id:p.id,title:'Page',description:null,questions:p.questions.map(q=>({...q,
   type:q.type,settings:q.settings??{},
   options:q.options.map((o,i)=>({id:q.id+'-option-'+i,value:o.value,label:o.label}))}))}));
 it('accepte les dépendances précédentes valides',()=>{
  expect(validateConditionalSettings(asStudio(pages))).toEqual([]);
 });
 it('rejette les références futures et les choix supprimés',()=>{
  const invalid={...choice,settings:{logicId:'bad',logic:{visibility:{action:'show' as const,match:'all' as const,
   conditions:[{sourceKey:'persistent-second',operator:'equals' as const,value:'inconnu'}]}}}};
  expect(validateConditionalSettings(asStudio([{id:'a',questions:[source,invalid]},pages[2]]))).not.toEqual([]);
 });
});
